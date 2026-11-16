ALTER TABLE users
    ADD COLUMN display_name text NULL,
    ADD COLUMN phone        varchar(16) NULL,
    ADD COLUMN avatar_key   text NULL,
    ADD CONSTRAINT users_display_name_len_chk CHECK (display_name IS NULL OR (char_length(btrim(display_name)) >= 1 AND char_length(display_name) <= 80)),
    ADD CONSTRAINT users_phone_fmt_chk CHECK (phone IS NULL OR phone ~ '^0[0-9]{9,10}$'),
    ADD CONSTRAINT users_avatar_key_fmt_chk CHECK (avatar_key IS NULL OR avatar_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$');
