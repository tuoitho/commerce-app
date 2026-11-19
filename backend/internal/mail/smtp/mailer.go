package smtp

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"commerce-backend/internal/config"
	"commerce-backend/internal/domain"
)

const defaultDialTimeout = 10 * time.Second

// Mailer sends transactional emails over SMTP while keeping credentials and OTP codes out of logs.
type Mailer struct {
	host     string
	port     int
	username string
	password string
	from     string
	timeout  time.Duration
	logger   *slog.Logger
}

var _ domain.Mailer = (*Mailer)(nil)

func NewMailer(cfg *config.Config, logger *slog.Logger) *Mailer {
	if logger == nil {
		logger = slog.Default()
	}
	var m Mailer
	if cfg != nil {
		m.host = cfg.SMTPHost
		m.port = cfg.SMTPPort
		m.username = cfg.SMTPUsername
		m.password = cfg.SMTPPassword
		m.from = cfg.SMTPFrom
	}
	m.timeout = defaultDialTimeout
	m.logger = logger
	return &m
}

// LogValue ensures SMTP credentials are never emitted if Mailer is logged directly.
func (m *Mailer) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("host", m.host),
		slog.Int("port", m.port),
		slog.String("from", m.from),
		slog.Bool("auth_configured", m.username != "" || m.password != ""),
	)
}

func (m *Mailer) SendPasswordResetOTP(ctx context.Context, toEmail, otp string, ttl time.Duration) error {
	if m.host == "" || m.port <= 0 || m.from == "" {
		m.logger.Error("smtp mailer configuration incomplete")
		return fmt.Errorf("%w: incomplete smtp configuration", domain.ErrEmailDeliveryFailed)
	}

	parsedFrom, err := mail.ParseAddress(m.from)
	if err != nil || parsedFrom.Address == "" {
		m.logger.Error("invalid smtp sender address", "error", err)
		return fmt.Errorf("%w: invalid sender address", domain.ErrEmailDeliveryFailed)
	}

	parsedTo, err := mail.ParseAddress(strings.TrimSpace(toEmail))
	if err != nil || parsedTo.Address == "" {
		m.logger.Error("invalid smtp recipient address", "error", err)
		return fmt.Errorf("%w: invalid recipient address", domain.ErrEmailDeliveryFailed)
	}

	addr := net.JoinHostPort(m.host, strconv.Itoa(m.port))
	dialer := &net.Dialer{Timeout: m.timeout}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		m.logger.Error("smtp dial failed", "host", m.host, "port", m.port, "error", err.Error())
		return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
	}

	deadline := time.Now().Add(m.timeout)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}
	_ = conn.SetDeadline(deadline)

	client, err := smtp.NewClient(conn, m.host)
	if err != nil {
		_ = conn.Close()
		m.logger.Error("smtp client init failed", "host", m.host, "port", m.port, "error", err.Error())
		return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
	}
	defer func() {
		_ = client.Close()
	}()

	if m.username != "" || m.password != "" {
		if ok, _ := client.Extension("STARTTLS"); ok {
			tlsCfg := &tls.Config{
				ServerName: m.host,
				MinVersion: tls.VersionTLS12,
			}
			if err := client.StartTLS(tlsCfg); err != nil {
				m.logger.Error("smtp starttls failed", "host", m.host, "port", m.port, "error", err.Error())
				return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
			}
		}
		auth := smtp.PlainAuth("", m.username, m.password, m.host)
		if err := client.Auth(auth); err != nil {
			m.logger.Error("smtp auth failed", "host", m.host, "port", m.port, "error", err.Error())
			return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
		}
	}

	if err := client.Mail(parsedFrom.Address); err != nil {
		m.logger.Error("smtp MAIL FROM failed", "host", m.host, "port", m.port, "error", err.Error())
		return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
	}
	if err := client.Rcpt(parsedTo.Address); err != nil {
		m.logger.Error("smtp RCPT TO failed", "host", m.host, "port", m.port, "error", err.Error())
		return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
	}

	wc, err := client.Data()
	if err != nil {
		m.logger.Error("smtp DATA failed", "host", m.host, "port", m.port, "error", err.Error())
		return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
	}

	msg := buildPasswordResetMessage(m.from, parsedTo.Address, otp, ttl)
	if _, err := wc.Write([]byte(msg)); err != nil {
		_ = wc.Close()
		m.logger.Error("smtp body write failed", "host", m.host, "port", m.port, "error", err.Error())
		return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
	}
	if err := wc.Close(); err != nil {
		m.logger.Error("smtp data close failed", "host", m.host, "port", m.port, "error", err.Error())
		return fmt.Errorf("%w: %v", domain.ErrEmailDeliveryFailed, err)
	}

	if err := client.Quit(); err != nil {
		m.logger.Warn("smtp QUIT returned error", "host", m.host, "port", m.port, "error", err.Error())
	}

	m.logger.Info("password reset otp email dispatched", "host", m.host, "port", m.port)
	return nil
}

func buildPasswordResetMessage(fromHeader, toEmail, otp string, ttl time.Duration) string {
	minutes := int(ttl.Minutes())
	if minutes < 1 {
		minutes = 1
	}
	subject := mime.QEncoding.Encode("utf-8", "Mã xác thực đặt lại mật khẩu AuraPhone")
	var b strings.Builder
	b.WriteString("From: ")
	b.WriteString(fromHeader)
	b.WriteString("\r\n")
	b.WriteString("To: ")
	b.WriteString(toEmail)
	b.WriteString("\r\n")
	b.WriteString("Subject: ")
	b.WriteString(subject)
	b.WriteString("\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
	b.WriteString("\r\n")
	b.WriteString("Xin chào,\r\n\r\n")
	b.WriteString("Mã xác thực OTP đặt lại mật khẩu tài khoản AuraPhone của bạn là: ")
	b.WriteString(otp)
	b.WriteString("\r\n")
	b.WriteString(fmt.Sprintf("Mã có hiệu lực trong %d phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.\r\n", minutes))
	return b.String()
}
