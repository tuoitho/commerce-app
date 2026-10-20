// Reference implementation for Backend HTTP Handler Unit Tests (Go / httptest).
// Place in your HTTP handler test package (e.g., backend/internal/delivery/http/contract_snapshot_test.go)
// to record and verify .dream/specs/<feature>/contract-snapshots.json without running a DB or server.
package http

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const normalizedSnapshotTimestamp = "2026-01-01T00:00:00Z"

type ContractSnapshotEntry struct {
	ContractID string         `json:"contractId"`
	Endpoint   string         `json:"endpoint"`
	Status     int            `json:"status"`
	Body       map[string]any `json:"body"`
}

func AssertOrRecordContractSnapshot(
	t *testing.T,
	feature string,
	key string,
	contractID string,
	endpoint string,
	status int,
	rawBody []byte,
) {
	t.Helper()

	var parsed map[string]any
	require.NoError(t, json.Unmarshal(rawBody, &parsed), "response body must be valid JSON")

	if meta, ok := parsed["meta"].(map[string]any); ok {
		if _, hasTS := meta["timestamp"]; hasTS {
			meta["timestamp"] = normalizedSnapshotTimestamp
		}
	}

	snapshotPath := filepath.Clean(filepath.Join("..", "..", "..", "..", ".dream", "specs", feature, "contract-snapshots.json"))
	snapshots := make(map[string]ContractSnapshotEntry)

	if existingBytes, err := os.ReadFile(snapshotPath); err == nil && len(existingBytes) > 0 {
		require.NoError(t, json.Unmarshal(existingBytes, &snapshots))
	}

	actualEntry := ContractSnapshotEntry{
		ContractID: contractID,
		Endpoint:   endpoint,
		Status:     status,
		Body:       parsed,
	}

	existingEntry, exists := snapshots[key]
	if !exists || os.Getenv("UPDATE_CONTRACT_SNAPSHOTS") == "1" {
		snapshots[key] = actualEntry
		require.NoError(t, os.MkdirAll(filepath.Dir(snapshotPath), 0o755))
		out, err := json.MarshalIndent(snapshots, "", "  ")
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(snapshotPath, append(out, '\n'), 0o644))
		return
	}

	expectedJSON, err := json.MarshalIndent(existingEntry, "", "  ")
	require.NoError(t, err)
	actualJSON, err := json.MarshalIndent(actualEntry, "", "  ")
	require.NoError(t, err)

	assert.JSONEq(t, string(expectedJSON), string(actualJSON),
		"httptest output drifted from .dream/specs/%s/contract-snapshots.json[%q]", feature, key)
}
