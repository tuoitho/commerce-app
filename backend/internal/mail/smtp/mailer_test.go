package smtp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"commerce-backend/internal/config"
	"commerce-backend/internal/domain"
)

type capturedSMTPMessage struct {
	From     string
	To       []string
	Data     string
	AuthLine string
}

type mockSMTPServer struct {
	listener net.Listener
	mu       sync.Mutex
	messages []capturedSMTPMessage
	failData bool
	wantAuth bool
}

func startMockSMTPServer(t *testing.T, wantAuth, failData bool) (*mockSMTPServer, int) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	srv := &mockSMTPServer{
		listener: ln,
		wantAuth: wantAuth,
		failData: failData,
	}
	go srv.serve()
	t.Cleanup(func() {
		_ = ln.Close()
	})
	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	port, _ := strconv.Atoi(portStr)
	return srv, port
}

func (s *mockSMTPServer) serve() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return
		}
		go s.handleConn(conn)
	}
}

func (s *mockSMTPServer) handleConn(conn net.Conn) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	r := bufio.NewReader(conn)
	w := bufio.NewWriter(conn)

	writeLine := func(line string) {
		_, _ = w.WriteString(line + "\r\n")
		_ = w.Flush()
	}

	writeLine("220 localhost ESMTP MockSMTP")

	var msg capturedSMTPMessage
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		upper := strings.ToUpper(line)

		switch {
		case strings.HasPrefix(upper, "EHLO") || strings.HasPrefix(upper, "HELO"):
			if s.wantAuth {
				writeLine("250-localhost")
				writeLine("250 AUTH PLAIN")
			} else {
				writeLine("250 localhost")
			}
		case strings.HasPrefix(upper, "AUTH PLAIN "):
			msg.AuthLine = strings.TrimPrefix(line, "AUTH PLAIN ")
			writeLine("235 Authentication succeeded")
		case strings.HasPrefix(upper, "MAIL FROM:"):
			msg.From = strings.TrimSpace(strings.TrimPrefix(line, "MAIL FROM:"))
			writeLine("250 OK")
		case strings.HasPrefix(upper, "RCPT TO:"):
			msg.To = append(msg.To, strings.TrimSpace(strings.TrimPrefix(line, "RCPT TO:")))
			writeLine("250 OK")
		case upper == "DATA":
			if s.failData {
				writeLine("554 Transaction failed")
				continue
			}
			writeLine("354 Start mail input; end with <CRLF>.<CRLF>")
			var body strings.Builder
			for {
				dataLine, err := r.ReadString('\n')
				if err != nil {
					return
				}
				trimmed := strings.TrimRight(dataLine, "\r\n")
				if trimmed == "." {
					break
				}
				body.WriteString(trimmed)
				body.WriteString("\n")
			}
			msg.Data = body.String()
			s.mu.Lock()
			s.messages = append(s.messages, msg)
			s.mu.Unlock()
			writeLine("250 OK queued")
		case upper == "QUIT":
			writeLine("221 Bye")
			return
		default:
			writeLine("250 OK")
		}
	}
}

func (s *mockSMTPServer) Messages() []capturedSMTPMessage {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]capturedSMTPMessage, len(s.messages))
	copy(out, s.messages)
	return out
}

func TestMailer_SendPasswordResetOTP_SuccessAndNoSecretLogs(t *testing.T) {
	srv, port := startMockSMTPServer(t, false, false)

	var logBuf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	cfg := &config.Config{
		SMTPHost:     "127.0.0.1",
		SMTPPort:     port,
		SMTPUsername: "",
		SMTPPassword: "top-secret-smtp-password",
		SMTPFrom:     "noreply@auraphone.local",
	}
	mailer := NewMailer(cfg, log)
	var _ domain.Mailer = mailer

	otp := "482913"
	err := mailer.SendPasswordResetOTP(context.Background(), "customer@example.com", otp, 10*time.Minute)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	msgs := srv.Messages()
	if len(msgs) != 1 {
		t.Fatalf("expected 1 SMTP message, got %d", len(msgs))
	}
	if !strings.Contains(msgs[0].From, "noreply@auraphone.local") {
		t.Errorf("From = %q, want noreply@auraphone.local", msgs[0].From)
	}
	if len(msgs[0].To) != 1 || !strings.Contains(msgs[0].To[0], "customer@example.com") {
		t.Errorf("To = %v, want customer@example.com", msgs[0].To)
	}
	if !strings.Contains(msgs[0].Data, otp) {
		t.Errorf("expected SMTP data to contain OTP %q, got:\n%s", otp, msgs[0].Data)
	}
	if !strings.Contains(msgs[0].Data, "10 phút") {
		t.Errorf("expected SMTP data to mention 10 phút, got:\n%s", msgs[0].Data)
	}

	log.Info("mailer ref", "mailer", mailer)
	logOut := logBuf.String()
	if strings.Contains(logOut, otp) {
		t.Fatalf("OTP leaked to slog: %s", logOut)
	}
	if strings.Contains(logOut, "top-secret-smtp-password") {
		t.Fatalf("SMTPPassword leaked to slog: %s", logOut)
	}
}

func TestMailer_SendPasswordResetOTP_AuthSuccess(t *testing.T) {
	srv, port := startMockSMTPServer(t, true, false)

	var logBuf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	cfg := &config.Config{
		SMTPHost:     "127.0.0.1",
		SMTPPort:     port,
		SMTPUsername: "smtp-user",
		SMTPPassword: "smtp-auth-password",
		SMTPFrom:     "AuraPhone <noreply@auraphone.local>",
	}
	mailer := NewMailer(cfg, log)

	if err := mailer.SendPasswordResetOTP(context.Background(), "user@example.com", "991122", 15*time.Minute); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	msgs := srv.Messages()
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	expectedAuth := base64.StdEncoding.EncodeToString([]byte("\x00smtp-user\x00smtp-auth-password"))
	if msgs[0].AuthLine != expectedAuth {
		t.Errorf("AuthLine = %q, want %q", msgs[0].AuthLine, expectedAuth)
	}
	if strings.Contains(logBuf.String(), "smtp-auth-password") || strings.Contains(logBuf.String(), "991122") {
		t.Fatalf("secret leaked in logs: %s", logBuf.String())
	}
}

func TestMailer_SendPasswordResetOTP_FailureDoesNotLeakSecrets(t *testing.T) {
	_, port := startMockSMTPServer(t, false, true)

	var logBuf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	cfg := &config.Config{
		SMTPHost:     "127.0.0.1",
		SMTPPort:     port,
		SMTPUsername: "smtp-user",
		SMTPPassword: "super-secret-password",
		SMTPFrom:     "noreply@auraphone.local",
	}
	mailer := NewMailer(cfg, log)

	otp := "774411"
	err := mailer.SendPasswordResetOTP(context.Background(), "fail@example.com", otp, 10*time.Minute)
	if err == nil {
		t.Fatal("expected SMTP error, got nil")
	}
	if !errors.Is(err, domain.ErrEmailDeliveryFailed) {
		t.Fatalf("expected ErrEmailDeliveryFailed, got %v", err)
	}

	// Also verify unreachable port returns ErrEmailDeliveryFailed
	unreachableCfg := &config.Config{
		SMTPHost: "127.0.0.1",
		SMTPPort: 1,
		SMTPFrom: "noreply@auraphone.local",
	}
	unreachableMailer := NewMailer(unreachableCfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err := unreachableMailer.SendPasswordResetOTP(context.Background(), "fail@example.com", otp, 10*time.Minute); !errors.Is(err, domain.ErrEmailDeliveryFailed) {
		t.Fatalf("expected ErrEmailDeliveryFailed for closed port, got %v", err)
	}

	logOut := logBuf.String()
	if strings.Contains(logOut, otp) || strings.Contains(logOut, "super-secret-password") {
		t.Fatalf("secret leaked in error logs: %s", logOut)
	}
}
