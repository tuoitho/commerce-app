-- Bảng bài viết do Admin đăng
CREATE TABLE posts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content    text NOT NULL CHECK (char_length(btrim(content)) >= 1 AND char_length(content) <= 5000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_created_at_id ON posts (created_at DESC, id DESC);

-- Bảng phương tiện (ảnh/video) của bài viết (hỗ trợ upload trước khi lưu bài viết với post_id NULL)
CREATE TABLE post_media (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     uuid NULL REFERENCES posts(id) ON DELETE CASCADE,
    uploader_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    object_key  text NOT NULL UNIQUE,
    file_type   text NOT NULL CHECK (file_type IN ('image', 'video')),
    file_name   text NOT NULL,
    file_size   bigint NOT NULL CHECK (
        file_size > 0 AND (
            (file_type = 'image' AND file_size <= 10485760) OR
            (file_type = 'video' AND file_size <= 52428800)
        )
    ),
    mime_type   text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm')),
    position    integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_media_post_position ON post_media (post_id, position ASC) WHERE post_id IS NOT NULL;
CREATE INDEX idx_post_media_uploader ON post_media (uploader_id);

-- Bảng liên kết sản phẩm giới thiệu (referred products) trong bài viết
CREATE TABLE post_referred_products (
    post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position   integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (post_id, product_id)
);

CREATE INDEX idx_post_referred_products_post_pos ON post_referred_products (post_id, position ASC);

-- Bảng cảm xúc trên bài viết
CREATE TABLE post_reactions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (post_id, user_id)
);

CREATE INDEX idx_post_reactions_post_id ON post_reactions (post_id);

-- Bảng bình luận bài viết (phân cấp tối đa 2 cấp: parent_id NULL là cấp 1, parent_id NOT NULL là cấp 2)
CREATE TABLE post_comments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    parent_id        uuid NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    reply_to_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
    content          text NOT NULL CHECK (char_length(btrim(content)) >= 1 AND char_length(content) <= 1000),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_post_comments_post_created ON post_comments (post_id, created_at ASC, id ASC);
CREATE INDEX idx_post_comments_parent_created ON post_comments (parent_id, created_at ASC, id ASC) WHERE parent_id IS NOT NULL;

-- Bảng cảm xúc trên bình luận
CREATE TABLE post_comment_reactions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id    uuid NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (comment_id, user_id)
);

CREATE INDEX idx_post_comment_reactions_comment_id ON post_comment_reactions (comment_id);

-- Bảng thông báo dùng chung toàn hệ thống (hỗ trợ bài viết/bình luận hiện tại và mở rộng cho đơn hàng/giao hàng trong tương lai)
CREATE TABLE notifications (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id          uuid NULL REFERENCES users(id) ON DELETE CASCADE,
    category          text NOT NULL DEFAULT 'post' CHECK (btrim(category) <> ''),
    notification_type text NOT NULL CHECK (btrim(notification_type) <> ''),
    post_id           uuid NULL REFERENCES posts(id) ON DELETE CASCADE,
    comment_id        uuid NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    reaction_type     text NULL CHECK (reaction_type IS NULL OR reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
    excerpt           text NOT NULL DEFAULT '',
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    is_read           boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (category <> 'post' OR post_id IS NOT NULL)
);

CREATE INDEX idx_notifications_recipient_created ON notifications (recipient_id, created_at DESC, id DESC);
CREATE INDEX idx_notifications_recipient_unread ON notifications (recipient_id) WHERE is_read = false;
