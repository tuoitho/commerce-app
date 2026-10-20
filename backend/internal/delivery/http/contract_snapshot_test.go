package http

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"
)

type contractSnapshotFile struct {
	Feature   string                           `json:"feature"`
	Snapshots map[string]contractSnapshotEntry `json:"snapshots"`
}

type contractSnapshotEntry struct {
	ContractID   string `json:"contractId"`
	Endpoint     string `json:"endpoint"`
	Status       int    `json:"status"`
	RequestBody  any    `json:"requestBody,omitempty"`
	ResponseBody any    `json:"responseBody"`
}

func assertOrRecordContractSnapshot(
	t *testing.T,
	snapshotFilePath string,
	feature string,
	snapshotKey string,
	contractID string,
	endpoint string,
	requestBody any,
	recorder *httptest.ResponseRecorder,
) {
	t.Helper()

	var actualBody any
	if recorder.Body.Len() > 0 {
		err := json.Unmarshal(recorder.Body.Bytes(), &actualBody)
		require.NoError(t, err, "response body must be valid JSON for contract %s", contractID)
	}

	entry := contractSnapshotEntry{
		ContractID:   contractID,
		Endpoint:     endpoint,
		Status:       recorder.Code,
		RequestBody:  requestBody,
		ResponseBody: actualBody,
	}

	doc := contractSnapshotFile{
		Feature:   feature,
		Snapshots: map[string]contractSnapshotEntry{},
	}

	if _, err := os.Stat(snapshotFilePath); err == nil {
		raw, err := os.ReadFile(snapshotFilePath)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(raw, &doc))
		if doc.Snapshots == nil {
			doc.Snapshots = map[string]contractSnapshotEntry{}
		}
	}

	if os.Getenv("UPDATE_CONTRACT_SNAPSHOTS") == "1" || doc.Snapshots[snapshotKey].Status == 0 {
		doc.Snapshots[snapshotKey] = entry
		out, err := json.MarshalIndent(doc, "", "  ")
		require.NoError(t, err)
		require.NoError(t, os.MkdirAll(filepath.Dir(snapshotFilePath), 0o755))
		require.NoError(t, os.WriteFile(snapshotFilePath, append(out, '\n'), 0o644))
		return
	}

	expected, exists := doc.Snapshots[snapshotKey]
	require.True(t, exists, "missing snapshot key %q in %s", snapshotKey, snapshotFilePath)
	require.Equal(t, expected.ContractID, entry.ContractID, "contractId mismatch for %s", snapshotKey)
	require.Equal(t, expected.Endpoint, entry.Endpoint, "endpoint mismatch for %s", snapshotKey)
	require.Equal(t, expected.Status, entry.Status, "HTTP status mismatch for %s", snapshotKey)

	assertContractShapeEqual(t, expected.ResponseBody, entry.ResponseBody, snapshotKey)
}

func assertContractShapeEqual(t *testing.T, expected any, actual any, path string) {
	t.Helper()
	expectedShape := extractJSONShape(expected)
	actualShape := extractJSONShape(actual)
	require.True(
		t,
		reflect.DeepEqual(expectedShape, actualShape),
		"contract shape drift at %s:\nexpected shape: %#v\nactual shape:   %#v",
		path,
		expectedShape,
		actualShape,
	)
}

func extractJSONShape(v any) any {
	if v == nil {
		return "null"
	}
	switch val := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, child := range val {
			out[k] = extractJSONShape(child)
		}
		return out
	case []any:
		if len(val) == 0 {
			return []any{}
		}
		out := make([]any, len(val))
		for i, child := range val {
			out[i] = extractJSONShape(child)
		}
		return out
	case string:
		return "string"
	case float64:
		return "number"
	case bool:
		return "boolean"
	default:
		return reflect.TypeOf(v).String()
	}
}
