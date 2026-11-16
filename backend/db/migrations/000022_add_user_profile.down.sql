ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_avatar_key_fmt_chk,
    DROP CONSTRAINT IF EXISTS users_phone_fmt_chk,
    DROP CONSTRAINT IF EXISTS users_display_name_len_chk,
    DROP COLUMN IF EXISTS avatar_key,
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS display_name;
