package mediamtx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClient_Ping(t *testing.T) {
	t.Run("reachable control API", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v3/paths/list" {
				t.Errorf("path = %q", r.URL.Path)
			}
			_, _ = w.Write([]byte(`{"itemCount":0,"pageCount":0,"items":[]}`))
		}))
		defer srv.Close()

		if err := New(srv.URL).Ping(context.Background()); err != nil {
			t.Fatalf("Ping() error = %v", err)
		}
	})

	t.Run("non-2xx response is an error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer srv.Close()

		if err := New(srv.URL).Ping(context.Background()); err == nil {
			t.Fatal("Ping() error = nil, want error")
		}
	})

	t.Run("unreachable server is an error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
		url := srv.URL
		srv.Close()

		if err := New(url).Ping(context.Background()); err == nil {
			t.Fatal("Ping() error = nil, want error")
		}
	})

	t.Run("slow server times out", func(t *testing.T) {
		release := make(chan struct{})
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			<-release
		}))
		defer srv.Close()
		defer close(release)

		client := New(srv.URL)
		client.timeout = 50 * time.Millisecond
		start := time.Now()
		if err := client.Ping(context.Background()); err == nil {
			t.Fatal("Ping() error = nil, want timeout")
		}
		if elapsed := time.Since(start); elapsed > time.Second {
			t.Fatalf("Ping() took %v, want it bounded by the timeout", elapsed)
		}
	})
}

func TestClient_PathOnline(t *testing.T) {
	cases := []struct {
		name    string
		status  int
		body    string
		want    bool
		wantErr bool
	}{
		{name: "online publisher", status: http.StatusOK, body: `{"name":"live/x","online":true,"ready":true}`, want: true},
		{name: "path without publisher", status: http.StatusOK, body: `{"name":"live/x","online":false,"ready":false}`, want: false},
		{name: "unknown path", status: http.StatusNotFound, body: `{"error":"path not found"}`, want: false},
		{name: "server failure", status: http.StatusInternalServerError, wantErr: true},
		{name: "malformed body", status: http.StatusOK, body: `{`, wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v3/paths/get/live/abc" {
					t.Errorf("path = %q", r.URL.Path)
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			got, err := New(srv.URL).PathOnline(context.Background(), "live/abc")
			if (err != nil) != tc.wantErr {
				t.Fatalf("PathOnline() error = %v, wantErr %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Fatalf("PathOnline() = %v, want %v", got, tc.want)
			}
		})
	}
}
