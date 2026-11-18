CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (email, password_hash, role, status, display_name)
VALUES (
    :'customer_email',
    crypt(:'customer_password', gen_salt('bf', 10)),
    'customer',
    'active',
    'Khách hàng mẫu'
)
ON CONFLICT (email) DO NOTHING;
