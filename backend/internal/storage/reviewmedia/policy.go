package reviewmedia

import (
	"encoding/json"
	"strings"
)

type policyDocument struct {
	Version   string            `json:"Version"`
	Statement []policyStatement `json:"Statement"`
}

type policyStatement struct {
	Effect    string          `json:"Effect"`
	Principal json.RawMessage `json:"Principal"`
	Action    json.RawMessage `json:"Action"`
	Resource  json.RawMessage `json:"Resource"`
}

// IsPolicyAllowingAnonymousRead inspects an S3 bucket policy JSON document and returns true
// if any statement allows anonymous (wildcard Principal "*") read access (s3:GetObject, s3:*, *).
func IsPolicyAllowingAnonymousRead(policyJSON string) (bool, error) {
	trimmed := strings.TrimSpace(policyJSON)
	if trimmed == "" {
		return false, nil
	}

	var doc policyDocument
	if err := json.Unmarshal([]byte(trimmed), &doc); err != nil {
		// Attempt parsing single statement if Statement is an object rather than an array
		var singleDoc struct {
			Version   string          `json:"Version"`
			Statement policyStatement `json:"Statement"`
		}
		if err2 := json.Unmarshal([]byte(trimmed), &singleDoc); err2 == nil && len(singleDoc.Statement.Effect) > 0 {
			doc.Version = singleDoc.Version
			doc.Statement = []policyStatement{singleDoc.Statement}
		} else {
			return false, err
		}
	}

	for _, stmt := range doc.Statement {
		if !strings.EqualFold(strings.TrimSpace(stmt.Effect), "Allow") {
			continue
		}

		if isPrincipalAnonymous(stmt.Principal) && isActionAllowingRead(stmt.Action) {
			return true, nil
		}
	}

	return false, nil
}

func isPrincipalAnonymous(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}

	// Case 1: String e.g. "*"
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		return strings.TrimSpace(str) == "*"
	}

	// Case 2: Array of strings e.g. ["*"]
	var arr []string
	if err := json.Unmarshal(raw, &arr); err == nil {
		for _, s := range arr {
			if strings.TrimSpace(s) == "*" {
				return true
			}
		}
		return false
	}

	// Case 3: Map e.g. {"AWS": "*"} or {"AWS": ["*"]}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err == nil {
		for _, v := range obj {
			if isPrincipalAnonymous(v) {
				return true
			}
		}
	}

	return false
}

func isActionAllowingRead(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}

	readActions := []string{
		"s3:getobject",
		"s3:*",
		"*",
	}

	// Case 1: Single string e.g. "s3:GetObject"
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		sLower := strings.ToLower(strings.TrimSpace(str))
		for _, a := range readActions {
			if sLower == a {
				return true
			}
		}
		return false
	}

	// Case 2: Array of strings e.g. ["s3:GetObject", "s3:ListBucket"]
	var arr []string
	if err := json.Unmarshal(raw, &arr); err == nil {
		for _, s := range arr {
			sLower := strings.ToLower(strings.TrimSpace(s))
			for _, a := range readActions {
				if sLower == a {
					return true
				}
			}
		}
	}

	return false
}
