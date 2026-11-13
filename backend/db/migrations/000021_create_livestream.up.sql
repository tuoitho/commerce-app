CREATE TABLE live_sessions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title             text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    status            text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
    created_by        uuid NOT NULL REFERENCES users(id),
    pinned_product_id uuid NULL REFERENCES products(id) ON DELETE SET NULL,
    heart_count       bigint NOT NULL DEFAULT 0 CHECK (heart_count >= 0),
    peak_viewers      integer NOT NULL DEFAULT 0 CHECK (peak_viewers >= 0),
    started_at        timestamptz NOT NULL DEFAULT now(),
    last_signal_at    timestamptz NULL,
    ended_at          timestamptz NULL,
    end_reason        text NULL CHECK (end_reason IN ('admin', 'signal_lost')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'live') = (ended_at IS NULL))
);

-- At most one session may be broadcasting at any time.
CREATE UNIQUE INDEX live_sessions_single_live_idx ON live_sessions ((true)) WHERE status = 'live';

CREATE TABLE live_session_products (
    session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position   integer NOT NULL CHECK (position >= 0),
    PRIMARY KEY (session_id, product_id)
);

CREATE TABLE live_variant_prices (
    session_id     uuid NOT NULL,
    product_id     uuid NOT NULL,
    variant_id     uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    live_price_vnd numeric NOT NULL CHECK (live_price_vnd = trunc(live_price_vnd) AND live_price_vnd > 0),
    quota          integer NULL CHECK (quota BETWEEN 1 AND 100000),
    sold_quantity  integer NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
    PRIMARY KEY (session_id, variant_id),
    FOREIGN KEY (session_id, product_id) REFERENCES live_session_products(session_id, product_id) ON DELETE CASCADE,
    CHECK (quota IS NULL OR sold_quantity <= quota)
);

CREATE TABLE live_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id),
    content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 200),
    hidden_at  timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_comments_session_created_idx ON live_comments (session_id, created_at DESC, id DESC);
CREATE INDEX live_comments_session_user_created_idx ON live_comments (session_id, user_id, created_at DESC);

ALTER TABLE order_items ADD COLUMN live_session_id uuid NULL REFERENCES live_sessions(id);

-- Live prices currently in effect: the session is broadcasting, quota remains,
-- and the live price still undercuts the variant's regular price.
CREATE VIEW live_active_variant_prices AS
SELECT lvp.session_id, lvp.product_id, lvp.variant_id, lvp.live_price_vnd, lvp.quota, lvp.sold_quantity
FROM live_variant_prices lvp
JOIN live_sessions s ON s.id = lvp.session_id AND s.status = 'live'
JOIN product_variants v ON v.id = lvp.variant_id
WHERE lvp.live_price_vnd < v.price_vnd
  AND (lvp.quota IS NULL OR lvp.sold_quantity < lvp.quota);
