--
-- PostgreSQL database dump
--

\restrict 8rrhbghcl0ZhLebwGh80NQVbcdyyNpDYhGqWVKpHdubcQqxU4zo5gENYdShFHqc

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.variant_option_values DROP CONSTRAINT IF EXISTS variant_option_values_product_id_variant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.variant_option_values DROP CONSTRAINT IF EXISTS variant_option_values_product_id_group_id_option_value_id_fkey;
ALTER TABLE IF EXISTS ONLY public.review_replies DROP CONSTRAINT IF EXISTS review_replies_review_id_fkey;
ALTER TABLE IF EXISTS ONLY public.review_media DROP CONSTRAINT IF EXISTS review_media_review_id_fkey;
ALTER TABLE IF EXISTS ONLY public.review_helpfulness_votes DROP CONSTRAINT IF EXISTS review_helpfulness_votes_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.review_helpfulness_votes DROP CONSTRAINT IF EXISTS review_helpfulness_votes_review_id_fkey;
ALTER TABLE IF EXISTS ONLY public.review_helpfulness_votes DROP CONSTRAINT IF EXISTS review_helpfulness_votes_reply_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_requests DROP CONSTRAINT IF EXISTS return_requests_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_requests DROP CONSTRAINT IF EXISTS return_requests_refunded_by_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_requests DROP CONSTRAINT IF EXISTS return_requests_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_request_items DROP CONSTRAINT IF EXISTS return_request_items_return_request_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_request_items DROP CONSTRAINT IF EXISTS return_request_items_received_variant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_request_items DROP CONSTRAINT IF EXISTS return_request_items_order_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_variants DROP CONSTRAINT IF EXISTS product_variants_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_order_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_option_values DROP CONSTRAINT IF EXISTS product_option_values_product_id_group_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_option_groups DROP CONSTRAINT IF EXISTS product_option_groups_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_images DROP CONSTRAINT IF EXISTS product_images_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.posts DROP CONSTRAINT IF EXISTS posts_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_referred_products DROP CONSTRAINT IF EXISTS post_referred_products_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_referred_products DROP CONSTRAINT IF EXISTS post_referred_products_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_media DROP CONSTRAINT IF EXISTS post_media_uploader_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_media DROP CONSTRAINT IF EXISTS post_media_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_comments DROP CONSTRAINT IF EXISTS post_comments_reply_to_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_comments DROP CONSTRAINT IF EXISTS post_comments_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_comments DROP CONSTRAINT IF EXISTS post_comments_parent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_comments DROP CONSTRAINT IF EXISTS post_comments_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_comment_reactions DROP CONSTRAINT IF EXISTS post_comment_reactions_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.post_comment_reactions DROP CONSTRAINT IF EXISTS post_comment_reactions_comment_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_live_session_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_comment_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE IF EXISTS ONLY public.live_variant_prices DROP CONSTRAINT IF EXISTS live_variant_prices_variant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.live_variant_prices DROP CONSTRAINT IF EXISTS live_variant_prices_session_id_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_pinned_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.live_session_products DROP CONSTRAINT IF EXISTS live_session_products_session_id_fkey;
ALTER TABLE IF EXISTS ONLY public.live_session_products DROP CONSTRAINT IF EXISTS live_session_products_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.live_comments DROP CONSTRAINT IF EXISTS live_comments_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.live_comments DROP CONSTRAINT IF EXISTS live_comments_session_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attached_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_attachments DROP CONSTRAINT IF EXISTS chat_attachments_uploader_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_attachments DROP CONSTRAINT IF EXISTS chat_attachments_message_id_fkey;
ALTER TABLE IF EXISTS ONLY public.cart_items DROP CONSTRAINT IF EXISTS cart_items_variant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.addresses DROP CONSTRAINT IF EXISTS addresses_user_id_fkey;
DROP INDEX IF EXISTS public.variant_option_values_product_group_value_idx;
DROP INDEX IF EXISTS public.variant_option_values_option_value_id_idx;
DROP INDEX IF EXISTS public.users_created_at_id_idx;
DROP INDEX IF EXISTS public.return_requests_user_id_idx;
DROP INDEX IF EXISTS public.return_requests_status_created_at_idx;
DROP INDEX IF EXISTS public.return_requests_refunded_at_idx;
DROP INDEX IF EXISTS public.return_requests_order_id_idx;
DROP INDEX IF EXISTS public.return_requests_one_refunded_per_order_idx;
DROP INDEX IF EXISTS public.return_requests_one_open_per_order_idx;
DROP INDEX IF EXISTS public.return_request_items_return_request_id_idx;
DROP INDEX IF EXISTS public.return_request_items_request_order_item_unique_idx;
DROP INDEX IF EXISTS public.return_request_items_order_item_id_idx;
DROP INDEX IF EXISTS public.refresh_tokens_token_hash_idx;
DROP INDEX IF EXISTS public.products_stock_quantity_idx;
DROP INDEX IF EXISTS public.products_name_lower_idx;
DROP INDEX IF EXISTS public.products_category_id_idx;
DROP INDEX IF EXISTS public.product_variants_stock_quantity_idx;
DROP INDEX IF EXISTS public.product_variants_product_active_idx;
DROP INDEX IF EXISTS public.product_variants_price_vnd_idx;
DROP INDEX IF EXISTS public.product_reviews_created_at_id_idx;
DROP INDEX IF EXISTS public.product_option_values_product_group_position_idx;
DROP INDEX IF EXISTS public.product_option_groups_product_id_position_idx;
DROP INDEX IF EXISTS public.product_images_product_id_position_idx;
DROP INDEX IF EXISTS public.product_favorites_user_order_idx;
DROP INDEX IF EXISTS public.orders_user_id_status_idx;
DROP INDEX IF EXISTS public.orders_user_id_created_at_idx;
DROP INDEX IF EXISTS public.orders_status_created_at_idx;
DROP INDEX IF EXISTS public.orders_delivered_at_idx;
DROP INDEX IF EXISTS public.orders_created_at_idx;
DROP INDEX IF EXISTS public.order_items_variant_id_idx;
DROP INDEX IF EXISTS public.order_items_product_id_idx;
DROP INDEX IF EXISTS public.order_items_order_id_idx;
DROP INDEX IF EXISTS public.live_sessions_single_live_idx;
DROP INDEX IF EXISTS public.live_comments_session_user_created_idx;
DROP INDEX IF EXISTS public.live_comments_session_created_idx;
DROP INDEX IF EXISTS public.idx_review_helpfulness_votes_review_vote;
DROP INDEX IF EXISTS public.idx_review_helpfulness_votes_reply_vote;
DROP INDEX IF EXISTS public.idx_posts_created_at_id;
DROP INDEX IF EXISTS public.idx_post_referred_products_post_pos;
DROP INDEX IF EXISTS public.idx_post_reactions_post_id;
DROP INDEX IF EXISTS public.idx_post_media_uploader;
DROP INDEX IF EXISTS public.idx_post_media_post_position;
DROP INDEX IF EXISTS public.idx_post_comments_post_created;
DROP INDEX IF EXISTS public.idx_post_comments_parent_created;
DROP INDEX IF EXISTS public.idx_post_comment_reactions_comment_id;
DROP INDEX IF EXISTS public.idx_notifications_unread_group;
DROP INDEX IF EXISTS public.idx_notifications_recipient_updated;
DROP INDEX IF EXISTS public.idx_notifications_recipient_unread;
DROP INDEX IF EXISTS public.idx_notifications_recipient_created;
DROP INDEX IF EXISTS public.idx_conversations_user_id;
DROP INDEX IF EXISTS public.idx_conversations_last_message_at;
DROP INDEX IF EXISTS public.idx_chat_messages_conv_created;
DROP INDEX IF EXISTS public.idx_chat_messages_attached_order;
DROP INDEX IF EXISTS public.idx_chat_attachments_uploader;
DROP INDEX IF EXISTS public.idx_chat_attachments_message_id;
DROP INDEX IF EXISTS public.categories_name_normalized_uidx;
DROP INDEX IF EXISTS public.cart_items_variant_id_idx;
DROP INDEX IF EXISTS public.cart_items_user_id_created_at_idx;
DROP INDEX IF EXISTS public.addresses_user_id_is_default_idx;
DROP INDEX IF EXISTS public.addresses_user_id_idx;
ALTER TABLE IF EXISTS ONLY public.variant_option_values DROP CONSTRAINT IF EXISTS variant_option_values_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE IF EXISTS ONLY public.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public.review_replies DROP CONSTRAINT IF EXISTS review_replies_review_id_key;
ALTER TABLE IF EXISTS ONLY public.review_replies DROP CONSTRAINT IF EXISTS review_replies_pkey;
ALTER TABLE IF EXISTS ONLY public.review_media DROP CONSTRAINT IF EXISTS review_media_review_id_media_type_position_key;
ALTER TABLE IF EXISTS ONLY public.review_media DROP CONSTRAINT IF EXISTS review_media_pkey;
ALTER TABLE IF EXISTS ONLY public.review_media DROP CONSTRAINT IF EXISTS review_media_object_key_key;
ALTER TABLE IF EXISTS ONLY public.review_helpfulness_votes DROP CONSTRAINT IF EXISTS review_helpfulness_votes_user_review_unique;
ALTER TABLE IF EXISTS ONLY public.review_helpfulness_votes DROP CONSTRAINT IF EXISTS review_helpfulness_votes_user_reply_unique;
ALTER TABLE IF EXISTS ONLY public.review_helpfulness_votes DROP CONSTRAINT IF EXISTS review_helpfulness_votes_pkey;
ALTER TABLE IF EXISTS ONLY public.return_requests DROP CONSTRAINT IF EXISTS return_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.return_request_items DROP CONSTRAINT IF EXISTS return_request_items_pkey;
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_token_hash_key;
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_pkey;
ALTER TABLE IF EXISTS ONLY public.product_variants DROP CONSTRAINT IF EXISTS product_variants_product_id_id_key;
ALTER TABLE IF EXISTS ONLY public.product_variants DROP CONSTRAINT IF EXISTS product_variants_pkey;
ALTER TABLE IF EXISTS ONLY public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_pkey;
ALTER TABLE IF EXISTS ONLY public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_order_item_id_key;
ALTER TABLE IF EXISTS ONLY public.product_option_values DROP CONSTRAINT IF EXISTS product_option_values_product_id_group_id_id_key;
ALTER TABLE IF EXISTS ONLY public.product_option_values DROP CONSTRAINT IF EXISTS product_option_values_pkey;
ALTER TABLE IF EXISTS ONLY public.product_option_values DROP CONSTRAINT IF EXISTS product_option_values_group_id_label_key;
ALTER TABLE IF EXISTS ONLY public.product_option_groups DROP CONSTRAINT IF EXISTS product_option_groups_product_id_label_key;
ALTER TABLE IF EXISTS ONLY public.product_option_groups DROP CONSTRAINT IF EXISTS product_option_groups_product_id_id_key;
ALTER TABLE IF EXISTS ONLY public.product_option_groups DROP CONSTRAINT IF EXISTS product_option_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.product_images DROP CONSTRAINT IF EXISTS product_images_pkey;
ALTER TABLE IF EXISTS ONLY public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_pkey;
ALTER TABLE IF EXISTS ONLY public.posts DROP CONSTRAINT IF EXISTS posts_pkey;
ALTER TABLE IF EXISTS ONLY public.post_referred_products DROP CONSTRAINT IF EXISTS post_referred_products_pkey;
ALTER TABLE IF EXISTS ONLY public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_post_id_user_id_key;
ALTER TABLE IF EXISTS ONLY public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_pkey;
ALTER TABLE IF EXISTS ONLY public.post_media DROP CONSTRAINT IF EXISTS post_media_pkey;
ALTER TABLE IF EXISTS ONLY public.post_media DROP CONSTRAINT IF EXISTS post_media_object_key_key;
ALTER TABLE IF EXISTS ONLY public.post_comments DROP CONSTRAINT IF EXISTS post_comments_pkey;
ALTER TABLE IF EXISTS ONLY public.post_comment_reactions DROP CONSTRAINT IF EXISTS post_comment_reactions_pkey;
ALTER TABLE IF EXISTS ONLY public.post_comment_reactions DROP CONSTRAINT IF EXISTS post_comment_reactions_comment_id_user_id_key;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_pkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.live_variant_prices DROP CONSTRAINT IF EXISTS live_variant_prices_pkey;
ALTER TABLE IF EXISTS ONLY public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.live_session_products DROP CONSTRAINT IF EXISTS live_session_products_pkey;
ALTER TABLE IF EXISTS ONLY public.live_comments DROP CONSTRAINT IF EXISTS live_comments_pkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_user_id_key;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_attachments DROP CONSTRAINT IF EXISTS chat_attachments_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_attachments DROP CONSTRAINT IF EXISTS chat_attachments_object_key_key;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE IF EXISTS ONLY public.cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_variant_id_key;
ALTER TABLE IF EXISTS ONLY public.cart_items DROP CONSTRAINT IF EXISTS cart_items_pkey;
ALTER TABLE IF EXISTS ONLY public.addresses DROP CONSTRAINT IF EXISTS addresses_pkey;
DROP TABLE IF EXISTS public.variant_option_values;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.schema_migrations;
DROP TABLE IF EXISTS public.review_replies;
DROP TABLE IF EXISTS public.review_media;
DROP TABLE IF EXISTS public.review_helpfulness_votes;
DROP TABLE IF EXISTS public.return_requests;
DROP TABLE IF EXISTS public.return_request_items;
DROP TABLE IF EXISTS public.refresh_tokens;
DROP TABLE IF EXISTS public.products;
DROP TABLE IF EXISTS public.product_reviews;
DROP TABLE IF EXISTS public.product_option_values;
DROP TABLE IF EXISTS public.product_option_groups;
DROP TABLE IF EXISTS public.product_images;
DROP TABLE IF EXISTS public.product_favorites;
DROP TABLE IF EXISTS public.posts;
DROP TABLE IF EXISTS public.post_referred_products;
DROP TABLE IF EXISTS public.post_reactions;
DROP TABLE IF EXISTS public.post_media;
DROP TABLE IF EXISTS public.post_comments;
DROP TABLE IF EXISTS public.post_comment_reactions;
DROP TABLE IF EXISTS public.orders;
DROP TABLE IF EXISTS public.order_items;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.live_session_products;
DROP TABLE IF EXISTS public.live_comments;
DROP VIEW IF EXISTS public.live_active_variant_prices;
DROP TABLE IF EXISTS public.product_variants;
DROP TABLE IF EXISTS public.live_variant_prices;
DROP TABLE IF EXISTS public.live_sessions;
DROP TABLE IF EXISTS public.conversations;
DROP TABLE IF EXISTS public.chat_messages;
DROP TABLE IF EXISTS public.chat_attachments;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.cart_items;
DROP TABLE IF EXISTS public.addresses;
DROP EXTENSION IF EXISTS citext;
--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recipient_name text NOT NULL,
    phone text NOT NULL,
    province_code integer NOT NULL,
    province_name text NOT NULL,
    ward_code integer NOT NULL,
    ward_name text NOT NULL,
    detail_address text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity numeric NOT NULL,
    selected boolean DEFAULT true NOT NULL,
    snapshot_brand_name text DEFAULT ''::text NOT NULL,
    snapshot_product_name text DEFAULT ''::text NOT NULL,
    snapshot_model text DEFAULT ''::text NOT NULL,
    snapshot_image_url text DEFAULT ''::text NOT NULL,
    snapshot_options jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cart_items_quantity_check CHECK (((quantity = trunc(quantity)) AND (quantity > (0)::numeric) AND (quantity < '100000000000000000000000000000000000000'::numeric))),
    CONSTRAINT cart_items_quantity_int64 CHECK (((quantity = trunc(quantity)) AND ((quantity >= (1)::numeric) AND (quantity <= ('9223372036854775807'::bigint)::numeric)))),
    CONSTRAINT cart_items_snapshot_options_check CHECK ((jsonb_typeof(snapshot_options) = 'array'::text))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid,
    uploader_id uuid NOT NULL,
    object_key text NOT NULL,
    file_type text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_attachments_file_size_check CHECK ((file_size > 0)),
    CONSTRAINT chat_attachments_file_type_check CHECK ((file_type = ANY (ARRAY['image'::text, 'video'::text])))
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    attached_order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_content_check CHECK ((char_length(content) <= 2000)),
    CONSTRAINT chat_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['customer'::text, 'admin'::text])))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    admin_last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: live_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'live'::text NOT NULL,
    created_by uuid NOT NULL,
    pinned_product_id uuid,
    heart_count bigint DEFAULT 0 NOT NULL,
    peak_viewers integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_signal_at timestamp with time zone,
    ended_at timestamp with time zone,
    end_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_sessions_check CHECK (((status = 'live'::text) = (ended_at IS NULL))),
    CONSTRAINT live_sessions_end_reason_check CHECK ((end_reason = ANY (ARRAY['admin'::text, 'signal_lost'::text]))),
    CONSTRAINT live_sessions_heart_count_check CHECK ((heart_count >= 0)),
    CONSTRAINT live_sessions_peak_viewers_check CHECK ((peak_viewers >= 0)),
    CONSTRAINT live_sessions_status_check CHECK ((status = ANY (ARRAY['live'::text, 'ended'::text]))),
    CONSTRAINT live_sessions_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);


--
-- Name: live_variant_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_variant_prices (
    session_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    live_price_vnd numeric NOT NULL,
    quota integer,
    sold_quantity integer DEFAULT 0 NOT NULL,
    CONSTRAINT live_variant_prices_check CHECK (((quota IS NULL) OR (sold_quantity <= quota))),
    CONSTRAINT live_variant_prices_live_price_vnd_check CHECK (((live_price_vnd = trunc(live_price_vnd)) AND (live_price_vnd > (0)::numeric))),
    CONSTRAINT live_variant_prices_quota_check CHECK (((quota >= 1) AND (quota <= 100000))),
    CONSTRAINT live_variant_prices_sold_quantity_check CHECK ((sold_quantity >= 0))
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    price_vnd numeric NOT NULL,
    stock_quantity numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_variants_price_vnd_check CHECK (((price_vnd = trunc(price_vnd)) AND (price_vnd > (0)::numeric) AND (price_vnd < '100000000000000000000000000000000000000'::numeric))),
    CONSTRAINT product_variants_stock_quantity_check CHECK ((stock_quantity >= (0)::numeric)),
    CONSTRAINT product_variants_stock_quantity_int64 CHECK (((stock_quantity = trunc(stock_quantity)) AND ((stock_quantity >= (0)::numeric) AND (stock_quantity <= ('9223372036854775807'::bigint)::numeric))))
);


--
-- Name: live_active_variant_prices; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.live_active_variant_prices AS
 SELECT lvp.session_id,
    lvp.product_id,
    lvp.variant_id,
    lvp.live_price_vnd,
    lvp.quota,
    lvp.sold_quantity
   FROM ((public.live_variant_prices lvp
     JOIN public.live_sessions s ON (((s.id = lvp.session_id) AND (s.status = 'live'::text))))
     JOIN public.product_variants v ON ((v.id = lvp.variant_id)))
  WHERE ((lvp.live_price_vnd < v.price_vnd) AND ((lvp.quota IS NULL) OR (lvp.sold_quantity < lvp.quota)));


--
-- Name: live_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    hidden_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_comments_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 200)))
);


--
-- Name: live_session_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_session_products (
    session_id uuid NOT NULL,
    product_id uuid NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT live_session_products_position_check CHECK (("position" >= 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    actor_id uuid,
    category text DEFAULT 'post'::text NOT NULL,
    notification_type text NOT NULL,
    post_id uuid,
    comment_id uuid,
    reaction_type text,
    excerpt text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_key text DEFAULT ''::text NOT NULL,
    actor_count integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_actor_count_check CHECK ((actor_count >= 1)),
    CONSTRAINT notifications_category_check CHECK ((btrim(category) <> ''::text)),
    CONSTRAINT notifications_check CHECK (((category <> 'post'::text) OR (post_id IS NOT NULL))),
    CONSTRAINT notifications_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT notifications_notification_type_check CHECK ((btrim(notification_type) <> ''::text)),
    CONSTRAINT notifications_reaction_type_check CHECK (((reaction_type IS NULL) OR (reaction_type = ANY (ARRAY['like'::text, 'love'::text, 'haha'::text, 'wow'::text, 'sad'::text, 'angry'::text]))))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    brand_name text NOT NULL,
    product_name text NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    unit_price_vnd numeric NOT NULL,
    quantity numeric NOT NULL,
    line_total_vnd numeric NOT NULL,
    live_session_id uuid,
    CONSTRAINT order_items_line_total_vnd_check CHECK (((line_total_vnd = trunc(line_total_vnd)) AND (line_total_vnd >= (0)::numeric) AND (line_total_vnd < '100000000000000000000000000000000000000'::numeric))),
    CONSTRAINT order_items_options_check CHECK ((jsonb_typeof(options) = 'array'::text)),
    CONSTRAINT order_items_quantity_check CHECK (((quantity = trunc(quantity)) AND (quantity > (0)::numeric) AND (quantity < '100000000000000000000000000000000000000'::numeric))),
    CONSTRAINT order_items_unit_price_vnd_check CHECK (((unit_price_vnd = trunc(unit_price_vnd)) AND (unit_price_vnd > (0)::numeric) AND (unit_price_vnd < '100000000000000000000000000000000000000'::numeric)))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending_confirmation'::text NOT NULL,
    payment_method text DEFAULT 'cod'::text NOT NULL,
    subtotal_vnd numeric NOT NULL,
    shipping_fee_vnd numeric NOT NULL,
    total_vnd numeric NOT NULL,
    recipient_name text NOT NULL,
    phone text NOT NULL,
    province_name text NOT NULL,
    ward_name text NOT NULL,
    detail_address text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    delivered_at timestamp with time zone,
    CONSTRAINT orders_payment_method_check CHECK ((payment_method = 'cod'::text)),
    CONSTRAINT orders_shipping_fee_vnd_check CHECK (((shipping_fee_vnd = trunc(shipping_fee_vnd)) AND (shipping_fee_vnd >= (0)::numeric) AND (shipping_fee_vnd < '100000000000000000000000000000000000000'::numeric))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending_confirmation'::text, 'confirmed'::text, 'preparing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'cancel_requested'::text, 'partially_returned'::text, 'returned'::text]))),
    CONSTRAINT orders_subtotal_vnd_check CHECK (((subtotal_vnd = trunc(subtotal_vnd)) AND (subtotal_vnd >= (0)::numeric) AND (subtotal_vnd < '100000000000000000000000000000000000000'::numeric))),
    CONSTRAINT orders_total_vnd_check CHECK (((total_vnd = trunc(total_vnd)) AND (total_vnd >= (0)::numeric) AND (total_vnd < '100000000000000000000000000000000000000'::numeric)))
);


--
-- Name: post_comment_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comment_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_comment_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['like'::text, 'love'::text, 'haha'::text, 'wow'::text, 'sad'::text, 'angry'::text])))
);


--
-- Name: post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    parent_id uuid,
    reply_to_user_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_comments_check CHECK (((parent_id IS NULL) OR (parent_id <> id))),
    CONSTRAINT post_comments_content_check CHECK (((char_length(btrim(content)) >= 1) AND (char_length(content) <= 1000)))
);


--
-- Name: post_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    uploader_id uuid NOT NULL,
    object_key text NOT NULL,
    file_type text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_media_check CHECK (((file_size > 0) AND (((file_type = 'image'::text) AND (file_size <= 10485760)) OR ((file_type = 'video'::text) AND (file_size <= 52428800))))),
    CONSTRAINT post_media_file_type_check CHECK ((file_type = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT post_media_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/gif'::text, 'video/mp4'::text, 'video/webm'::text]))),
    CONSTRAINT post_media_position_check CHECK (("position" >= 0))
);


--
-- Name: post_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['like'::text, 'love'::text, 'haha'::text, 'wow'::text, 'sad'::text, 'angry'::text])))
);


--
-- Name: post_referred_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_referred_products (
    post_id uuid NOT NULL,
    product_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT post_referred_products_position_check CHECK (("position" >= 0))
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT posts_content_check CHECK (((char_length(btrim(content)) >= 1) AND (char_length(content) <= 5000)))
);


--
-- Name: product_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_favorites (
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    favorited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    url text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_option_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_option_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    label text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT product_option_groups_position_check CHECK (("position" >= 0))
);


--
-- Name: product_option_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_option_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    group_id uuid NOT NULL,
    label text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT product_option_values_position_check CHECK (("position" >= 0))
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_item_id uuid NOT NULL,
    rating smallint NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    edit_count smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_reviews_comment_check CHECK ((char_length(comment) <= 1000)),
    CONSTRAINT product_reviews_edit_count_check CHECK (((edit_count >= 0) AND (edit_count <= 1))),
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    price numeric(10,2) NOT NULL,
    currency text NOT NULL,
    stock_quantity numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    active boolean DEFAULT false NOT NULL,
    brand text DEFAULT ''::text NOT NULL,
    CONSTRAINT products_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT products_stock_quantity_check CHECK ((stock_quantity >= (0)::numeric)),
    CONSTRAINT products_stock_quantity_int64 CHECK (((stock_quantity = trunc(stock_quantity)) AND ((stock_quantity >= (0)::numeric) AND (stock_quantity <= ('9223372036854775807'::bigint)::numeric))))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: return_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_request_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_request_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    quantity bigint NOT NULL,
    received_variant_id uuid,
    CONSTRAINT return_request_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: return_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending_approval'::text NOT NULL,
    reason_code text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    reject_reason text DEFAULT ''::text NOT NULL,
    refund_amount_vnd numeric,
    refunded_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    received_at timestamp with time zone,
    refunded_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    expected_refund_amount_vnd numeric NOT NULL,
    CONSTRAINT return_requests_description_length_check CHECK ((char_length(description) <= 1000)),
    CONSTRAINT return_requests_expected_refund_amount_vnd_check CHECK (((expected_refund_amount_vnd = trunc(expected_refund_amount_vnd)) AND (expected_refund_amount_vnd > (0)::numeric))),
    CONSTRAINT return_requests_reason_code_check CHECK ((reason_code = ANY (ARRAY['defective'::text, 'not_as_described'::text, 'wrong_or_missing'::text, 'changed_mind'::text]))),
    CONSTRAINT return_requests_refund_amount_vnd_check CHECK (((refund_amount_vnd = trunc(refund_amount_vnd)) AND (refund_amount_vnd > (0)::numeric))),
    CONSTRAINT return_requests_refunded_fields_check CHECK (((status <> 'refunded'::text) OR ((refund_amount_vnd IS NOT NULL) AND (refunded_by_user_id IS NOT NULL) AND (refunded_at IS NOT NULL)))),
    CONSTRAINT return_requests_reject_reason_check CHECK (((char_length(reject_reason) <= 1000) AND ((status <> 'rejected'::text) OR (char_length(TRIM(BOTH FROM reject_reason)) > 0)))),
    CONSTRAINT return_requests_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'received'::text, 'refunded'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: review_helpfulness_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_helpfulness_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    review_id uuid,
    reply_id uuid,
    vote text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_helpfulness_votes_target_check CHECK ((((review_id IS NOT NULL) AND (reply_id IS NULL)) OR ((review_id IS NULL) AND (reply_id IS NOT NULL)))),
    CONSTRAINT review_helpfulness_votes_vote_check CHECK ((vote = ANY (ARRAY['helpful'::text, 'unhelpful'::text])))
);


--
-- Name: review_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    media_type text NOT NULL,
    mime_type text NOT NULL,
    object_key text NOT NULL,
    size_bytes bigint NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_media_check CHECK (((size_bytes > 0) AND (((media_type = 'image'::text) AND (size_bytes <= 5000000)) OR ((media_type = 'video'::text) AND (size_bytes <= 50000000))))),
    CONSTRAINT review_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT review_media_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'video/mp4'::text, 'video/webm'::text]))),
    CONSTRAINT review_media_position_check CHECK (("position" >= 0))
);


--
-- Name: review_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_replies_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 1000)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    dirty boolean NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role character varying(32) DEFAULT 'customer'::character varying NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    locked_at timestamp with time zone,
    lock_reason text,
    last_active_at timestamp with time zone,
    CONSTRAINT users_lock_reason_len_chk CHECK (((lock_reason IS NULL) OR (char_length(lock_reason) <= 500))),
    CONSTRAINT users_lock_state_chk CHECK (((((status)::text = 'locked'::text) AND (locked_at IS NOT NULL)) OR (((status)::text = 'active'::text) AND (locked_at IS NULL) AND (lock_reason IS NULL)))),
    CONSTRAINT users_status_chk CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'locked'::character varying])::text[])))
);


--
-- Name: variant_option_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_option_values (
    variant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    group_id uuid NOT NULL,
    option_value_id uuid NOT NULL
);


--
-- Data for Name: addresses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.addresses (id, user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default, created_at, updated_at) FROM stdin;
aeff7094-e543-4bca-bc85-9f06ca6e5630	ededb01d-da93-47a8-989b-f513f7d5ed20	a	0362092222	33	Tỉnh Hưng Yên	12064	Xã Nguyễn Văn Linh	s	t	2026-11-13 04:32:48.047989+00	2026-11-13 04:32:48.047989+00
80000000-0000-0000-0000-000000000001	22222222-1111-1111-1111-111111111111	Nguyễn Minh Anh	0912345678	1	Thành phố Hà Nội	70	Phường Hoàn Kiếm	18 Lý Thái Tổ	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
80000000-0000-0000-0000-000000000002	22222222-1111-1111-1111-111111111111	Trần Quốc Bảo	0987654321	79	Thành phố Hồ Chí Minh	26743	Phường Bến Thành	72 Lê Lợi	f	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
80000000-0000-0000-0000-000000000003	22222222-1111-1111-1111-222222222222	Lê Thu Hà	0905123456	48	Thành phố Đà Nẵng	20242	Phường Hải Châu	25 Bạch Đằng	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
80000000-0000-0000-0000-000000000004	22222222-1111-1111-1111-222222222222	Phạm Gia Huy	0938765432	1	Thành phố Hà Nội	4	Phường Ba Đình	12 Nguyễn Thái Học	f	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
80000000-0000-0000-0000-000000000005	ededb01d-da93-47a8-989b-f513f7d5ed20	Vũ Hoàng Nam	0977123456	79	Thành phố Hồ Chí Minh	26740	Phường Sài Gòn	101 Nguyễn Huệ	f	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
\.


--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cart_items (id, user_id, variant_id, quantity, selected, snapshot_brand_name, snapshot_product_name, snapshot_model, snapshot_image_url, snapshot_options, created_at, updated_at) FROM stdin;
b0da1798-29eb-4ef8-a3b8-3c04d8f888e3	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	13000000-0000-0000-0000-000000000040	1	t	Samsung	Samsung Galaxy S25 Ultra	SM-S938B	https://picsum.photos/seed/galaxy-s25-ultra/600/600	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Đen"}]	2026-11-13 04:25:25.306575+00	2026-11-13 04:27:46.640478+00
1aa91803-62c1-41c7-bf95-8b714742ec9b	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	aaaaaaaa-1111-1111-1111-111111111112	1	t	TestBrand	Reviewed Phone	RP-1		[]	2026-11-13 04:25:20.225236+00	2026-11-13 04:27:46.640478+00
70000000-0000-0000-0000-000000000001	22222222-1111-1111-1111-111111111111	13000000-0000-0000-0000-000000000007	1	t	Apple	iPhone 16 Pro	A3294	https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Back_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_White_Titanium.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan đen"}, {"groupLabel": "Phiên bản mạng", "valueLabel": "5G"}]	2026-11-13 04:53:39.655957+00	2026-11-13 04:53:39.655957+00
70000000-0000-0000-0000-000000000002	22222222-1111-1111-1111-111111111111	13000000-0000-0000-0000-000000000040	1	t	Samsung	Samsung Galaxy S25 Ultra	SM-S938B	https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg/1280px-Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Đen"}]	2026-11-13 04:53:39.655957+00	2026-11-13 04:53:39.655957+00
70000000-0000-0000-0000-000000000003	22222222-1111-1111-1111-111111111111	13000000-0000-0000-0000-000000000073	2	t	Xiaomi	POCO X7 Pro	24122RKC7G	https://i02.appmifile.com/mi-com-product/fly-birds/poco-x7-pro/pc/1a097d170ec6940798552eee961fc641.png	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Vàng POCO"}]	2026-11-13 04:53:39.655957+00	2026-11-13 04:53:39.655957+00
70000000-0000-0000-0000-000000000004	22222222-1111-1111-1111-222222222222	13000000-0000-0000-0000-000000000013	1	t	Xiaomi	Xiaomi 15	24129PN74G	https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Xiaomi_15_%281%29.jpg/1280px-Xiaomi_15_%281%29.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Đen"}]	2026-11-13 04:53:39.655957+00	2026-11-13 04:53:39.655957+00
70000000-0000-0000-0000-000000000005	22222222-1111-1111-1111-222222222222	13000000-0000-0000-0000-000000000009	1	t	Apple	iPhone 16e	A3409	https://upload.wikimedia.org/wikipedia/commons/6/65/IPhone_16e.png	[{"groupLabel": "Dung lượng", "valueLabel": "128GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Đen"}]	2026-11-13 04:53:39.655957+00	2026-11-13 04:53:39.655957+00
70000000-0000-0000-0000-000000000006	ededb01d-da93-47a8-989b-f513f7d5ed20	13000000-0000-0000-0000-000000000021	1	t	Apple	iPhone 16 Pro Max	A3297	https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Sa Mạc"}]	2026-11-13 04:53:39.655957+00	2026-11-13 04:53:39.655957+00
70000000-0000-0000-0000-000000000007	ededb01d-da93-47a8-989b-f513f7d5ed20	13000000-0000-0000-0000-000000000069	1	t	Xiaomi	Redmi Note 14 Pro+	24090RA29G	https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Redmi_Note_14_Pro%2B_%281%29.jpg/1280px-Redmi_Note_14_Pro%2B_%281%29.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Tím Lavender"}]	2026-11-13 04:53:39.655957+00	2026-11-13 04:53:39.655957+00
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, created_at) FROM stdin;
00000000-0000-0000-0000-000000000001	Electronics	2026-11-12 13:49:14.284466+00
00000000-0000-0000-0000-000000000002	Books	2026-11-12 13:49:14.284466+00
00000000-0000-0000-0000-000000000003	Clothing	2026-11-12 13:49:14.284466+00
00000000-0000-0000-0000-000000000004	Home & Kitchen	2026-11-12 13:49:14.284466+00
10000000-0000-0000-0000-000000000001	Điện thoại	2026-11-12 13:49:14.284466+00
10000000-0000-0000-0000-000000000002	Máy tính	2026-11-12 13:49:14.284466+00
10000000-0000-0000-0000-000000000003	Đồ công nghệ khác	2026-11-12 13:49:14.284466+00
\.


--
-- Data for Name: chat_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_attachments (id, message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, created_at) FROM stdin;
f76dcc7c-bd1d-4ff2-b308-b9ea4acbe312	feefe0b3-a218-4e5e-aacf-e7d17b149a4e	ededb01d-da93-47a8-989b-f513f7d5ed20	chat/aa421bca-911e-416e-9577-b07d0702f99f/97e84a649a4f42111b5e.jpg	image	97e84a649a4f42111b5e.jpg	147219	image/jpeg	2026-11-13 04:10:06.223104+00
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_messages (id, conversation_id, sender_id, sender_role, content, attached_order_id, created_at) FROM stdin;
43aed3a0-d330-4586-805c-1dff1061b7aa	0d8d6204-894c-4969-bb21-33d043f98a33	ededb01d-da93-47a8-989b-f513f7d5ed20	customer	sdsd	\N	2026-11-13 04:10:01.664719+00
feefe0b3-a218-4e5e-aacf-e7d17b149a4e	0d8d6204-894c-4969-bb21-33d043f98a33	ededb01d-da93-47a8-989b-f513f7d5ed20	customer		\N	2026-11-13 04:10:07.373173+00
ce62118a-0343-4a55-9e00-5a748735618f	0d8d6204-894c-4969-bb21-33d043f98a33	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	admin	sd	\N	2026-11-13 04:10:16.980802+00
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversations (id, user_id, last_message_at, customer_last_read_at, admin_last_read_at, created_at, updated_at) FROM stdin;
0d8d6204-894c-4969-bb21-33d043f98a33	ededb01d-da93-47a8-989b-f513f7d5ed20	2026-11-13 04:10:16.980802+00	2026-11-13 04:10:16.74693+00	2026-11-13 04:10:22.699838+00	2026-11-13 04:07:26.193024+00	2026-11-13 04:10:22.522755+00
\.


--
-- Data for Name: live_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.live_comments (id, session_id, user_id, content, hidden_at, created_at) FROM stdin;
15d831ea-4c98-4300-ab23-9c055b4babc4	ae196de4-96fd-4034-af11-90bd95212619	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	f	\N	2026-11-13 04:25:02.198421+00
2ab8b415-8d34-49cc-9e8f-2c01f5ce8cc4	ae196de4-96fd-4034-af11-90bd95212619	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	sd	\N	2026-11-13 04:27:41.282405+00
8c1f8d2f-5244-461e-a368-6e4ad270f3be	ae196de4-96fd-4034-af11-90bd95212619	ededb01d-da93-47a8-989b-f513f7d5ed20	sd	\N	2026-11-13 04:27:54.218286+00
bd69e8d6-ca43-4678-a534-801a90bb3b48	94659474-9c5b-44f2-a447-b2e8fe4852ca	ededb01d-da93-47a8-989b-f513f7d5ed20	sd	\N	2026-11-13 04:33:44.065216+00
\.


--
-- Data for Name: live_session_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.live_session_products (session_id, product_id, "position") FROM stdin;
ae196de4-96fd-4034-af11-90bd95212619	aaaaaaaa-1111-1111-1111-111111111111	0
ae196de4-96fd-4034-af11-90bd95212619	10000000-0000-0001-0000-000000000010	1
ae196de4-96fd-4034-af11-90bd95212619	10000000-0000-0001-0000-000000000020	2
\.


--
-- Data for Name: live_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.live_sessions (id, title, status, created_by, pinned_product_id, heart_count, peak_viewers, started_at, last_signal_at, ended_at, end_reason, created_at, updated_at) FROM stdin;
94659474-9c5b-44f2-a447-b2e8fe4852ca	sds	live	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	\N	0	1	2026-11-13 04:33:24.652451+00	2026-11-13 04:52:58.591112+00	\N	\N	2026-11-13 04:33:24.652451+00	2026-11-13 04:33:24.652451+00
ae196de4-96fd-4034-af11-90bd95212619	sd	ended	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	\N	33	1	2026-11-13 04:24:56.050471+00	2026-11-13 04:32:53.589866+00	2026-11-13 04:33:18.149812+00	admin	2026-11-13 04:24:56.050471+00	2026-11-13 04:33:18.149812+00
\.


--
-- Data for Name: live_variant_prices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.live_variant_prices (session_id, product_id, variant_id, live_price_vnd, quota, sold_quantity) FROM stdin;
ae196de4-96fd-4034-af11-90bd95212619	aaaaaaaa-1111-1111-1111-111111111111	aaaaaaaa-1111-1111-1111-111111111112	2424245	\N	0
ae196de4-96fd-4034-af11-90bd95212619	10000000-0000-0001-0000-000000000010	13000000-0000-0000-0000-000000000039	22	\N	1
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, recipient_id, actor_id, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, group_key, actor_count, updated_at) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, variant_id, product_id, brand_name, product_name, model, image_url, options, unit_price_vnd, quantity, line_total_vnd, live_session_id) FROM stdin;
99999999-1111-1111-1111-222222222221	99999999-1111-1111-1111-111111111111	aaaaaaaa-1111-1111-1111-111111111112	aaaaaaaa-1111-1111-1111-111111111111	TestBrand	Reviewed Phone	RP-1	https://example.com/img.jpg	[]	10000000	1	10000000	\N
99999999-1111-1111-1111-222222222222	99999999-1111-1111-1111-111111111111	aaaaaaaa-1111-1111-1111-111111111112	aaaaaaaa-1111-1111-1111-111111111111	TestBrand	Reviewed Phone	RP-1	https://example.com/img.jpg	[]	10000000	1	10000000	\N
99999999-1111-1111-1111-222222222223	99999999-1111-1111-1111-111111111111	aaaaaaaa-1111-1111-1111-111111111112	aaaaaaaa-1111-1111-1111-111111111111	TestBrand	Reviewed Phone	RP-1	https://example.com/img.jpg	[]	10000000	1	10000000	\N
0120111d-7d61-4499-ac3d-1fe3bf478ada	31b58a3b-ed9f-4316-bf94-ca1bd0ac74d5	13000000-0000-0000-0000-000000000039	10000000-0000-0001-0000-000000000010	Samsung	Samsung Galaxy S25 Ultra	SM-S938B	https://picsum.photos/seed/galaxy-s25-ultra/600/600	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Bạc"}]	22	1	22	ae196de4-96fd-4034-af11-90bd95212619
acdfe5db-2895-4ced-ab2d-c09502c1a752	31b58a3b-ed9f-4316-bf94-ca1bd0ac74d5	13000000-0000-0000-0000-000000000040	10000000-0000-0001-0000-000000000010	Samsung	Samsung Galaxy S25 Ultra	SM-S938B	https://picsum.photos/seed/galaxy-s25-ultra/600/600	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Đen"}]	35990000	1	35990000	\N
90000000-0000-0001-0000-000000000001	90000000-0000-0000-0000-000000000001	13000000-0000-0000-0000-000000000007	10000000-0000-0001-0000-000000000001	Apple	iPhone 16 Pro	A3294	https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Back_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_White_Titanium.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan đen"}, {"groupLabel": "Phiên bản mạng", "valueLabel": "5G"}]	32490000	1	32490000	\N
90000000-0000-0001-0000-000000000002	90000000-0000-0000-0000-000000000001	13000000-0000-0000-0000-000000000040	10000000-0000-0001-0000-000000000010	Samsung	Samsung Galaxy S25 Ultra	SM-S938B	https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg/1280px-Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Đen"}]	35990000	1	35990000	\N
90000000-0000-0001-0000-000000000003	90000000-0000-0000-0000-000000000002	13000000-0000-0000-0000-000000000013	10000000-0000-0001-0000-000000000003	Xiaomi	Xiaomi 15	24129PN74G	https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Xiaomi_15_%281%29.jpg/1280px-Xiaomi_15_%281%29.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Đen"}]	20990000	1	20990000	\N
90000000-0000-0001-0000-000000000004	90000000-0000-0000-0000-000000000002	13000000-0000-0000-0000-000000000073	10000000-0000-0001-0000-000000000019	Xiaomi	POCO X7 Pro	24122RKC7G	https://i02.appmifile.com/mi-com-product/fly-birds/poco-x7-pro/pc/1a097d170ec6940798552eee961fc641.png	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Vàng POCO"}]	9890000	2	19780000	\N
90000000-0000-0001-0000-000000000005	90000000-0000-0000-0000-000000000003	13000000-0000-0000-0000-000000000061	10000000-0000-0001-0000-000000000016	Xiaomi	Xiaomi 15 Ultra	25010PN30G	https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Xiaomi_15_Ultra_001.jpg/1280px-Xiaomi_15_Ultra_001.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "512GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Đen Da"}]	34990000	1	34990000	\N
90000000-0000-0001-0000-000000000006	90000000-0000-0000-0000-000000000004	13000000-0000-0000-0000-000000000021	10000000-0000-0001-0000-000000000005	Apple	iPhone 16 Pro Max	A3297	https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Sa Mạc"}]	36990000	1	36990000	\N
90000000-0000-0001-0000-000000000007	90000000-0000-0000-0000-000000000004	13000000-0000-0000-0000-000000000056	10000000-0000-0001-0000-000000000014	Samsung	Samsung Galaxy A55 5G	SM-A556B	https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Samsung_Galaxy_A55_5G_2024.jpg/1280px-Samsung_Galaxy_A55_5G_2024.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "128GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Xanh Iceblue"}]	9690000	1	9690000	\N
90000000-0000-0001-0000-000000000008	90000000-0000-0000-0000-000000000005	13000000-0000-0000-0000-000000000029	10000000-0000-0001-0000-000000000007	Apple	iPhone 15 Pro Max	A3106	https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Front_of_iPhone_15_Pro_Max.jpg/1280px-Front_of_iPhone_15_Pro_Max.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Xanh"}]	31490000	1	31490000	\N
90000000-0000-0001-0000-000000000009	90000000-0000-0000-0000-000000000005	13000000-0000-0000-0000-000000000065	10000000-0000-0001-0000-000000000017	Xiaomi	Xiaomi 14T Pro	2407FPN8EG	https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Xiaomi_14T_Pro.jpg/1280px-Xiaomi_14T_Pro.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "256GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Titan Xám"}]	17990000	1	17990000	\N
90000000-0000-0001-0000-000000000010	90000000-0000-0000-0000-000000000006	13000000-0000-0000-0000-000000000025	10000000-0000-0001-0000-000000000006	Apple	iPhone 16	A3288	https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/About_iPhone_16_Ultramarine.jpg/1280px-About_iPhone_16_Ultramarine.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "128GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Hồng"}]	22990000	1	22990000	\N
90000000-0000-0001-0000-000000000011	90000000-0000-0000-0000-000000000006	13000000-0000-0000-0000-000000000043	10000000-0000-0001-0000-000000000011	Samsung	Samsung Galaxy S25	SM-S931B	https://upload.wikimedia.org/wikipedia/commons/e/ea/Galaxy_S25_Black.png	[{"groupLabel": "Dung lượng", "valueLabel": "128GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Xanh Navy"}]	21990000	1	21990000	\N
90000000-0000-0001-0000-000000000012	90000000-0000-0000-0000-000000000007	13000000-0000-0000-0000-000000000017	10000000-0000-0001-0000-000000000004	Xiaomi	Redmi Note 14	23117RA68G	https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg/1280px-Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "128GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Đen"}]	4990000	2	9980000	\N
90000000-0000-0001-0000-000000000013	90000000-0000-0000-0000-000000000007	13000000-0000-0000-0000-000000000077	10000000-0000-0001-0000-000000000020	Xiaomi	Redmi 14C	2409BRN2CG	https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Redmi_14C_front.jpg/1280px-Redmi_14C_front.jpg	[{"groupLabel": "Dung lượng", "valueLabel": "128GB"}, {"groupLabel": "Màu sắc", "valueLabel": "Xanh Sao Trời"}]	3190000	1	3190000	\N
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at, updated_at, confirmed_at, cancelled_at, delivered_at) FROM stdin;
31b58a3b-ed9f-4316-bf94-ca1bd0ac74d5	ededb01d-da93-47a8-989b-f513f7d5ed20	pending_confirmation	cod	35990022	0	35990022	a	0362092222	Tỉnh Hưng Yên	Xã Nguyễn Văn Linh	s	2026-11-13 04:32:49.841757+00	2026-11-13 04:32:49.841757+00	\N	\N	\N
99999999-1111-1111-1111-111111111111	11111111-2222-3333-4444-555555555551	delivered	cod	30000000	0	30000000	Test User	0901234567	Hanoi	Dich Vong	123 Test St	2026-11-12 13:51:13.873662+00	2026-11-12 13:51:13.873662+00	\N	\N	\N
90000000-0000-0000-0000-000000000001	22222222-1111-1111-1111-111111111111	delivered	cod	68480000	0	68480000	Nguyễn Minh Anh	0912345678	Thành phố Hà Nội	Phường Hoàn Kiếm	18 Lý Thái Tổ	2026-10-24 04:53:39.655957+00	2026-10-29 04:53:39.655957+00	2026-10-25 04:53:39.655957+00	\N	2026-10-29 04:53:39.655957+00
90000000-0000-0000-0000-000000000002	22222222-1111-1111-1111-111111111111	shipped	cod	40770000	0	40770000	Nguyễn Minh Anh	0912345678	Thành phố Hà Nội	Phường Hoàn Kiếm	18 Lý Thái Tổ	2026-11-09 04:53:39.655957+00	2026-11-11 04:53:39.655957+00	2026-11-10 04:53:39.655957+00	\N	\N
90000000-0000-0000-0000-000000000003	22222222-1111-1111-1111-111111111111	cancelled	cod	34990000	0	34990000	Trần Quốc Bảo	0987654321	Thành phố Hồ Chí Minh	Phường Bến Thành	72 Lê Lợi	2026-11-01 04:53:39.655957+00	2026-11-02 04:53:39.655957+00	\N	2026-11-02 04:53:39.655957+00	\N
90000000-0000-0000-0000-000000000004	22222222-1111-1111-1111-222222222222	pending_confirmation	cod	46680000	0	46680000	Lê Thu Hà	0905123456	Thành phố Đà Nẵng	Phường Hải Châu	25 Bạch Đằng	2026-11-13 04:48:39.655957+00	2026-11-13 04:48:39.655957+00	\N	\N	\N
90000000-0000-0000-0000-000000000005	22222222-1111-1111-1111-222222222222	confirmed	cod	49480000	0	49480000	Lê Thu Hà	0905123456	Thành phố Đà Nẵng	Phường Hải Châu	25 Bạch Đằng	2026-11-11 04:53:39.655957+00	2026-11-12 04:53:39.655957+00	2026-11-12 04:53:39.655957+00	\N	\N
90000000-0000-0000-0000-000000000006	ededb01d-da93-47a8-989b-f513f7d5ed20	preparing	cod	44980000	0	44980000	Vũ Hoàng Nam	0977123456	Thành phố Hồ Chí Minh	Phường Sài Gòn	101 Nguyễn Huệ	2026-11-12 04:53:39.655957+00	2026-11-12 08:53:39.655957+00	2026-11-12 08:53:39.655957+00	\N	\N
90000000-0000-0000-0000-000000000007	ededb01d-da93-47a8-989b-f513f7d5ed20	delivered	cod	13170000	0	13170000	Vũ Hoàng Nam	0977123456	Thành phố Hồ Chí Minh	Phường Sài Gòn	101 Nguyễn Huệ	2026-10-14 04:53:39.655957+00	2026-10-19 04:53:39.655957+00	2026-10-15 04:53:39.655957+00	\N	2026-10-19 04:53:39.655957+00
\.


--
-- Data for Name: post_comment_reactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.post_comment_reactions (id, comment_id, user_id, reaction_type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: post_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.post_comments (id, post_id, author_id, parent_id, reply_to_user_id, content, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: post_media; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.post_media (id, post_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, "position", created_at) FROM stdin;
\.


--
-- Data for Name: post_reactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.post_reactions (id, post_id, user_id, reaction_type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: post_referred_products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.post_referred_products (post_id, product_id, "position") FROM stdin;
\.


--
-- Data for Name: posts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.posts (id, author_id, content, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: product_favorites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_favorites (user_id, product_id, favorited_at) FROM stdin;
\.


--
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_images (id, product_id, url, "position", created_at) FROM stdin;
10000000-0000-0002-0000-000000000022	10000000-0000-0001-0000-000000000008	https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/About_iPhone_15_Blue.jpg/1280px-About_iPhone_15_Blue.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000023	10000000-0000-0001-0000-000000000008	https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Back_view_of_iPhone_15_Blue.jpg/1280px-Back_view_of_iPhone_15_Blue.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000024	10000000-0000-0001-0000-000000000008	https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Apple_iPhone_15.jpg/1280px-Apple_iPhone_15.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000025	10000000-0000-0001-0000-000000000009	https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Apple_iPhone_13_Pro.jpg/1280px-Apple_iPhone_13_Pro.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000026	10000000-0000-0001-0000-000000000009	https://upload.wikimedia.org/wikipedia/commons/9/91/Back_of_the_iPhone_13_Pro.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000027	10000000-0000-0001-0000-000000000009	https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Apple_iPhone_13_Pro_and_13_Pro_Max.jpg/1280px-Apple_iPhone_13_Pro_and_13_Pro_Max.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000028	10000000-0000-0001-0000-000000000010	https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg/1280px-Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000029	10000000-0000-0001-0000-000000000010	https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Rear_view_of_the_Samsung_Galaxy_S25_Ultra_smartphone.jpg/1280px-Rear_view_of_the_Samsung_Galaxy_S25_Ultra_smartphone.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000030	10000000-0000-0001-0000-000000000010	https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Samsung_Galaxy_S25_Ultra_smartphone_-_side_view.jpg/1280px-Samsung_Galaxy_S25_Ultra_smartphone_-_side_view.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000031	10000000-0000-0001-0000-000000000011	https://upload.wikimedia.org/wikipedia/commons/e/ea/Galaxy_S25_Black.png	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000032	10000000-0000-0001-0000-000000000011	https://upload.wikimedia.org/wikipedia/commons/d/d4/Galaxy_S25_Black_%28front%29.png	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000033	10000000-0000-0001-0000-000000000012	https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Samsung_Galaxy_Z_Fold_6.jpg/1280px-Samsung_Galaxy_Z_Fold_6.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000034	10000000-0000-0001-0000-000000000012	https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Samsung_Galaxy_Z_Fold_6_%282%29.jpg/1280px-Samsung_Galaxy_Z_Fold_6_%282%29.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000035	10000000-0000-0001-0000-000000000012	https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Samsung_Galaxy_Z_Fold_6_%283%29.jpg/1280px-Samsung_Galaxy_Z_Fold_6_%283%29.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000001	10000000-0000-0001-0000-000000000001	https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Back_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_White_Titanium.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000002	10000000-0000-0001-0000-000000000001	https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/About_iPhone_16_Pro_White_Titanium.jpg/1280px-About_iPhone_16_Pro_White_Titanium.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000003	10000000-0000-0001-0000-000000000001	https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Right_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Right_view_of_iPhone_16_Pro_White_Titanium.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000004	10000000-0000-0001-0000-000000000002	https://upload.wikimedia.org/wikipedia/commons/6/65/IPhone_16e.png	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000005	10000000-0000-0001-0000-000000000002	https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/IPhone_16e_black_front_view.jpg/1280px-IPhone_16e_black_front_view.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000006	10000000-0000-0001-0000-000000000002	https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/IPhone_16e_black_rear_view.jpg/1280px-IPhone_16e_black_rear_view.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000007	10000000-0000-0001-0000-000000000003	https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Xiaomi_15_%281%29.jpg/1280px-Xiaomi_15_%281%29.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000008	10000000-0000-0001-0000-000000000003	https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Xiaomi_15_%282%29.jpg/1280px-Xiaomi_15_%282%29.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000009	10000000-0000-0001-0000-000000000003	https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Xiaomi_15_%2854239541799%29.jpg/1280px-Xiaomi_15_%2854239541799%29.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000010	10000000-0000-0001-0000-000000000004	https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg/1280px-Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000011	10000000-0000-0001-0000-000000000004	https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Redmi_Note_14_Pro_%281%29.jpg/1280px-Redmi_Note_14_Pro_%281%29.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000012	10000000-0000-0001-0000-000000000004	https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Redmi_Note_14_Pro_%282%29.jpg/1280px-Redmi_Note_14_Pro_%282%29.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000013	10000000-0000-0001-0000-000000000005	https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000014	10000000-0000-0001-0000-000000000005	https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/About_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-About_iPhone_16_Pro_Max_Natural_Titanium.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000015	10000000-0000-0001-0000-000000000005	https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Right_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Right_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000016	10000000-0000-0001-0000-000000000006	https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/About_iPhone_16_Ultramarine.jpg/1280px-About_iPhone_16_Ultramarine.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000017	10000000-0000-0001-0000-000000000006	https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Back_view_of_iPhone_16_Ultramarine.jpg/1280px-Back_view_of_iPhone_16_Ultramarine.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000018	10000000-0000-0001-0000-000000000006	https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/IPhone_16_Ultramarine_Rear.png/1280px-IPhone_16_Ultramarine_Rear.png	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000019	10000000-0000-0001-0000-000000000007	https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Front_of_iPhone_15_Pro_Max.jpg/1280px-Front_of_iPhone_15_Pro_Max.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000020	10000000-0000-0001-0000-000000000007	https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Back_view_of_iPhone_15_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_15_Pro_Max_Natural_Titanium.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000021	10000000-0000-0001-0000-000000000007	https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/IPhone_15_Pro_Max_Camera.jpg/1280px-IPhone_15_Pro_Max_Camera.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000036	10000000-0000-0001-0000-000000000013	https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Samsung_Galaxy_Z_Flip_6.jpg/1280px-Samsung_Galaxy_Z_Flip_6.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000037	10000000-0000-0001-0000-000000000013	https://upload.wikimedia.org/wikipedia/commons/e/e3/%E4%B8%89%E6%98%9FGalaxy_Z_Flip6.png	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000038	10000000-0000-0001-0000-000000000014	https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Samsung_Galaxy_A55_5G_2024.jpg/1280px-Samsung_Galaxy_A55_5G_2024.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000039	10000000-0000-0001-0000-000000000014	https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Samsung_Galaxy_A55_5G_2024_%281%29.jpg/1280px-Samsung_Galaxy_A55_5G_2024_%281%29.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000040	10000000-0000-0001-0000-000000000014	https://upload.wikimedia.org/wikipedia/commons/b/b4/Galaxy_A55.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000041	10000000-0000-0001-0000-000000000015	https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Samsung_Galaxy_A15_5G_2024.jpg/1280px-Samsung_Galaxy_A15_5G_2024.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000042	10000000-0000-0001-0000-000000000015	https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Samsung_Galaxy_A15_5G_2024_%281%29.jpg/1280px-Samsung_Galaxy_A15_5G_2024_%281%29.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000043	10000000-0000-0001-0000-000000000015	https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Samsung_Galaxy_A15_20240529_HOF7502_RAW-Export_cens.png/1280px-Samsung_Galaxy_A15_20240529_HOF7502_RAW-Export_cens.png	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000044	10000000-0000-0001-0000-000000000016	https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Xiaomi_15_Ultra_001.jpg/1280px-Xiaomi_15_Ultra_001.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000045	10000000-0000-0001-0000-000000000016	https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Xiaomi_15_Ultra_002.jpg/1280px-Xiaomi_15_Ultra_002.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000046	10000000-0000-0001-0000-000000000016	https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Xiaomi_15_Ultra.jpg/1280px-Xiaomi_15_Ultra.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000047	10000000-0000-0001-0000-000000000017	https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Xiaomi_14T_Pro.jpg/1280px-Xiaomi_14T_Pro.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000048	10000000-0000-0001-0000-000000000017	https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Xiaomi_14T_Pro_front.jpg/1280px-Xiaomi_14T_Pro_front.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000049	10000000-0000-0001-0000-000000000017	https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Xiaomi-14T-Pro---RuinDig_001.jpg/1280px-Xiaomi-14T-Pro---RuinDig_001.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000050	10000000-0000-0001-0000-000000000018	https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Redmi_Note_14_Pro%2B_%281%29.jpg/1280px-Redmi_Note_14_Pro%2B_%281%29.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000051	10000000-0000-0001-0000-000000000018	https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Redmi_Note_14_Pro%2B_%282%29.jpg/1280px-Redmi_Note_14_Pro%2B_%282%29.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000052	10000000-0000-0001-0000-000000000018	https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Redmi_Note_14_Pro_Plus_Xiaomi_Store.jpg/1280px-Redmi_Note_14_Pro_Plus_Xiaomi_Store.jpg	2	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000053	10000000-0000-0001-0000-000000000019	https://i02.appmifile.com/mi-com-product/fly-birds/poco-x7-pro/pc/1a097d170ec6940798552eee961fc641.png	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000054	10000000-0000-0001-0000-000000000019	https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Poco_X7_Phone.png/1280px-Poco_X7_Phone.png	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000055	10000000-0000-0001-0000-000000000020	https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Redmi_14C_front.jpg/1280px-Redmi_14C_front.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000056	10000000-0000-0001-0000-000000000020	https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Redmi_14C_back.jpg/1280px-Redmi_14C_back.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000057	10000000-0000-0001-0000-000000000021	https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/OPPO_Find_X8_Pro_white_back.png/1280px-OPPO_Find_X8_Pro_white_back.png	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000058	10000000-0000-0001-0000-000000000021	https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Star_Grey_Oppo_Find_X8.jpg/1280px-Star_Grey_Oppo_Find_X8.jpg	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000059	10000000-0000-0001-0000-000000000022	https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Vivo_X200_Pro_blue.png/1280px-Vivo_X200_Pro_blue.png	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000060	10000000-0000-0001-0000-000000000022	https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Vivo_X200_Pro_mini_pink.png/1280px-Vivo_X200_Pro_mini_pink.png	1	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000061	10000000-0000-0001-0000-000000000023	https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/OnePlus_13_back.jpg/1280px-OnePlus_13_back.jpg	0	2026-11-13 04:53:39.655957+00
10000000-0000-0002-0000-000000000062	10000000-0000-0001-0000-000000000023	https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/OnePlus_13_volume_slider.jpg/1280px-OnePlus_13_volume_slider.jpg	1	2026-11-13 04:53:39.655957+00
\.


--
-- Data for Name: product_option_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_option_groups (id, product_id, label, "position") FROM stdin;
11000000-0000-0000-0000-000000000001	10000000-0000-0001-0000-000000000001	Dung lượng	0
11000000-0000-0000-0000-000000000002	10000000-0000-0001-0000-000000000001	Màu sắc	1
11000000-0000-0000-0000-000000000003	10000000-0000-0001-0000-000000000001	Phiên bản mạng	2
11000000-0000-0000-0000-000000000004	10000000-0000-0001-0000-000000000002	Dung lượng	0
11000000-0000-0000-0000-000000000005	10000000-0000-0001-0000-000000000002	Màu sắc	1
11000000-0000-0000-0000-000000000006	10000000-0000-0001-0000-000000000003	Dung lượng	0
11000000-0000-0000-0000-000000000007	10000000-0000-0001-0000-000000000003	Màu sắc	1
11000000-0000-0000-0000-000000000008	10000000-0000-0001-0000-000000000004	Dung lượng	0
11000000-0000-0000-0000-000000000009	10000000-0000-0001-0000-000000000004	Màu sắc	1
11000000-0000-0000-0000-000000000010	10000000-0000-0001-0000-000000000005	Dung lượng	0
11000000-0000-0000-0000-000000000011	10000000-0000-0001-0000-000000000005	Màu sắc	1
11000000-0000-0000-0000-000000000012	10000000-0000-0001-0000-000000000006	Dung lượng	0
11000000-0000-0000-0000-000000000013	10000000-0000-0001-0000-000000000006	Màu sắc	1
11000000-0000-0000-0000-000000000014	10000000-0000-0001-0000-000000000007	Dung lượng	0
11000000-0000-0000-0000-000000000015	10000000-0000-0001-0000-000000000007	Màu sắc	1
11000000-0000-0000-0000-000000000016	10000000-0000-0001-0000-000000000008	Dung lượng	0
11000000-0000-0000-0000-000000000017	10000000-0000-0001-0000-000000000008	Màu sắc	1
11000000-0000-0000-0000-000000000018	10000000-0000-0001-0000-000000000009	Dung lượng	0
11000000-0000-0000-0000-000000000019	10000000-0000-0001-0000-000000000009	Màu sắc	1
11000000-0000-0000-0000-000000000020	10000000-0000-0001-0000-000000000010	Dung lượng	0
11000000-0000-0000-0000-000000000021	10000000-0000-0001-0000-000000000010	Màu sắc	1
11000000-0000-0000-0000-000000000022	10000000-0000-0001-0000-000000000011	Dung lượng	0
11000000-0000-0000-0000-000000000023	10000000-0000-0001-0000-000000000011	Màu sắc	1
11000000-0000-0000-0000-000000000024	10000000-0000-0001-0000-000000000012	Dung lượng	0
11000000-0000-0000-0000-000000000025	10000000-0000-0001-0000-000000000012	Màu sắc	1
11000000-0000-0000-0000-000000000026	10000000-0000-0001-0000-000000000013	Dung lượng	0
11000000-0000-0000-0000-000000000027	10000000-0000-0001-0000-000000000013	Màu sắc	1
11000000-0000-0000-0000-000000000028	10000000-0000-0001-0000-000000000014	Dung lượng	0
11000000-0000-0000-0000-000000000029	10000000-0000-0001-0000-000000000014	Màu sắc	1
11000000-0000-0000-0000-000000000030	10000000-0000-0001-0000-000000000015	Dung lượng	0
11000000-0000-0000-0000-000000000031	10000000-0000-0001-0000-000000000015	Màu sắc	1
11000000-0000-0000-0000-000000000032	10000000-0000-0001-0000-000000000016	Dung lượng	0
11000000-0000-0000-0000-000000000033	10000000-0000-0001-0000-000000000016	Màu sắc	1
11000000-0000-0000-0000-000000000034	10000000-0000-0001-0000-000000000017	Dung lượng	0
11000000-0000-0000-0000-000000000035	10000000-0000-0001-0000-000000000017	Màu sắc	1
11000000-0000-0000-0000-000000000036	10000000-0000-0001-0000-000000000018	Dung lượng	0
11000000-0000-0000-0000-000000000037	10000000-0000-0001-0000-000000000018	Màu sắc	1
11000000-0000-0000-0000-000000000038	10000000-0000-0001-0000-000000000019	Dung lượng	0
11000000-0000-0000-0000-000000000039	10000000-0000-0001-0000-000000000019	Màu sắc	1
11000000-0000-0000-0000-000000000040	10000000-0000-0001-0000-000000000020	Dung lượng	0
11000000-0000-0000-0000-000000000041	10000000-0000-0001-0000-000000000020	Màu sắc	1
11000000-0000-0000-0000-000000000042	10000000-0000-0001-0000-000000000021	Dung lượng	0
11000000-0000-0000-0000-000000000043	10000000-0000-0001-0000-000000000021	Màu sắc	1
11000000-0000-0000-0000-000000000044	10000000-0000-0001-0000-000000000022	Dung lượng	0
11000000-0000-0000-0000-000000000045	10000000-0000-0001-0000-000000000022	Màu sắc	1
11000000-0000-0000-0000-000000000046	10000000-0000-0001-0000-000000000023	Dung lượng	0
11000000-0000-0000-0000-000000000047	10000000-0000-0001-0000-000000000023	Màu sắc	1
\.


--
-- Data for Name: product_option_values; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_option_values (id, product_id, group_id, label, "position") FROM stdin;
12000000-0000-0000-0000-000000000001	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	128GB	0
12000000-0000-0000-0000-000000000002	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	256GB	1
12000000-0000-0000-0000-000000000003	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	Titan tự nhiên	0
12000000-0000-0000-0000-000000000004	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	Titan đen	1
12000000-0000-0000-0000-000000000005	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	5G	0
12000000-0000-0000-0000-000000000006	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	Wi-Fi	1
12000000-0000-0000-0000-000000000007	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000004	128GB	0
12000000-0000-0000-0000-000000000008	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000004	256GB	1
12000000-0000-0000-0000-000000000009	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000005	Đen	0
12000000-0000-0000-0000-000000000010	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000005	Trắng	1
12000000-0000-0000-0000-000000000011	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000006	256GB	0
12000000-0000-0000-0000-000000000012	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000006	512GB	1
12000000-0000-0000-0000-000000000013	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000007	Đen	0
12000000-0000-0000-0000-000000000014	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000007	Trắng	1
12000000-0000-0000-0000-000000000015	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000008	128GB	0
12000000-0000-0000-0000-000000000016	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000008	256GB	1
12000000-0000-0000-0000-000000000017	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000009	Đen	0
12000000-0000-0000-0000-000000000018	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000009	Xanh	1
12000000-0000-0000-0000-000000000019	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000010	256GB	0
12000000-0000-0000-0000-000000000020	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000010	512GB	1
12000000-0000-0000-0000-000000000021	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000011	Titan Sa Mạc	0
12000000-0000-0000-0000-000000000022	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000011	Titan Đen	1
12000000-0000-0000-0000-000000000023	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000012	128GB	0
12000000-0000-0000-0000-000000000024	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000012	256GB	1
12000000-0000-0000-0000-000000000025	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000013	Hồng	0
12000000-0000-0000-0000-000000000026	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000013	Xanh Mòng Két	1
12000000-0000-0000-0000-000000000027	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000014	256GB	0
12000000-0000-0000-0000-000000000028	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000014	512GB	1
12000000-0000-0000-0000-000000000029	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000015	Titan Xanh	0
12000000-0000-0000-0000-000000000030	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000015	Titan Tự Nhiên	1
12000000-0000-0000-0000-000000000031	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000016	128GB	0
12000000-0000-0000-0000-000000000032	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000016	256GB	1
12000000-0000-0000-0000-000000000033	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000017	Xanh Lá	0
12000000-0000-0000-0000-000000000034	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000017	Đen	1
12000000-0000-0000-0000-000000000035	10000000-0000-0001-0000-000000000009	11000000-0000-0000-0000-000000000018	128GB	0
12000000-0000-0000-0000-000000000036	10000000-0000-0001-0000-000000000009	11000000-0000-0000-0000-000000000019	Midnight Đen	0
12000000-0000-0000-0000-000000000037	10000000-0000-0001-0000-000000000009	11000000-0000-0000-0000-000000000019	Starlight Trắng	1
12000000-0000-0000-0000-000000000038	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000020	256GB	0
12000000-0000-0000-0000-000000000039	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000020	512GB	1
12000000-0000-0000-0000-000000000040	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000021	Titan Bạc	0
12000000-0000-0000-0000-000000000041	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000021	Titan Đen	1
12000000-0000-0000-0000-000000000042	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000022	128GB	0
12000000-0000-0000-0000-000000000043	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000022	256GB	1
12000000-0000-0000-0000-000000000044	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000023	Xanh Navy	0
12000000-0000-0000-0000-000000000045	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000023	Vàng Bạc	1
12000000-0000-0000-0000-000000000046	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000024	256GB	0
12000000-0000-0000-0000-000000000047	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000024	512GB	1
12000000-0000-0000-0000-000000000048	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000025	Xám Metal	0
12000000-0000-0000-0000-000000000049	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000025	Xanh Navy	1
12000000-0000-0000-0000-000000000050	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000026	256GB	0
12000000-0000-0000-0000-000000000051	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000026	512GB	1
12000000-0000-0000-0000-000000000052	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000027	Xanh Mint	0
12000000-0000-0000-0000-000000000053	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000027	Vàng Sunny	1
12000000-0000-0000-0000-000000000054	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000028	128GB	0
12000000-0000-0000-0000-000000000055	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000028	256GB	1
12000000-0000-0000-0000-000000000056	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000029	Xanh Iceblue	0
12000000-0000-0000-0000-000000000057	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000029	Tím Lilac	1
12000000-0000-0000-0000-000000000058	10000000-0000-0001-0000-000000000015	11000000-0000-0000-0000-000000000030	128GB	0
12000000-0000-0000-0000-000000000059	10000000-0000-0001-0000-000000000015	11000000-0000-0000-0000-000000000031	Xanh Lơ	0
12000000-0000-0000-0000-000000000060	10000000-0000-0001-0000-000000000015	11000000-0000-0000-0000-000000000031	Đen	1
12000000-0000-0000-0000-000000000061	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000032	512GB	0
12000000-0000-0000-0000-000000000062	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000032	1TB	1
12000000-0000-0000-0000-000000000063	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000033	Đen Da	0
12000000-0000-0000-0000-000000000064	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000033	Trắng Gốm	1
12000000-0000-0000-0000-000000000065	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000034	256GB	0
12000000-0000-0000-0000-000000000066	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000034	512GB	1
12000000-0000-0000-0000-000000000067	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000035	Titan Xám	0
12000000-0000-0000-0000-000000000068	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000035	Titan Xanh	1
12000000-0000-0000-0000-000000000069	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000036	256GB	0
12000000-0000-0000-0000-000000000070	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000036	512GB	1
12000000-0000-0000-0000-000000000071	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000037	Tím Lavender	0
12000000-0000-0000-0000-000000000072	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000037	Đen	1
12000000-0000-0000-0000-000000000073	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000038	256GB	0
12000000-0000-0000-0000-000000000074	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000038	512GB	1
12000000-0000-0000-0000-000000000075	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000039	Vàng POCO	0
12000000-0000-0000-0000-000000000076	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000039	Đen Midnight	1
12000000-0000-0000-0000-000000000077	10000000-0000-0001-0000-000000000020	11000000-0000-0000-0000-000000000040	128GB	0
12000000-0000-0000-0000-000000000078	10000000-0000-0001-0000-000000000020	11000000-0000-0000-0000-000000000041	Xanh Sao Trời	0
12000000-0000-0000-0000-000000000079	10000000-0000-0001-0000-000000000020	11000000-0000-0000-0000-000000000041	Đen Mộng Mơ	1
12000000-0000-0000-0000-000000000080	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000042	256GB	0
12000000-0000-0000-0000-000000000081	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000042	512GB	1
12000000-0000-0000-0000-000000000082	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000043	Đen	0
12000000-0000-0000-0000-000000000083	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000043	Trắng	1
12000000-0000-0000-0000-000000000084	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000044	256GB	0
12000000-0000-0000-0000-000000000085	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000044	512GB	1
12000000-0000-0000-0000-000000000086	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000045	Xanh	0
12000000-0000-0000-0000-000000000087	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000045	Đen	1
12000000-0000-0000-0000-000000000088	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000046	256GB	0
12000000-0000-0000-0000-000000000089	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000046	512GB	1
12000000-0000-0000-0000-000000000090	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000047	Đen	0
12000000-0000-0000-0000-000000000091	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000047	Xanh	1
\.


--
-- Data for Name: product_reviews; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_reviews (id, order_item_id, rating, comment, edit_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_variants (id, product_id, price_vnd, stock_quantity, active, created_at, updated_at) FROM stdin;
13000000-0000-0000-0000-000000000001	10000000-0000-0001-0000-000000000001	30490000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000002	10000000-0000-0001-0000-000000000001	28990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000003	10000000-0000-0001-0000-000000000001	30490000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000004	10000000-0000-0001-0000-000000000001	28990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000005	10000000-0000-0001-0000-000000000001	32490000	8	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000006	10000000-0000-0001-0000-000000000001	30990000	15	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000007	10000000-0000-0001-0000-000000000001	32490000	22	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000008	10000000-0000-0001-0000-000000000001	30990000	29	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000009	10000000-0000-0001-0000-000000000002	16990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000010	10000000-0000-0001-0000-000000000002	16990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000011	10000000-0000-0001-0000-000000000002	18990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000012	10000000-0000-0001-0000-000000000002	18990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000013	10000000-0000-0001-0000-000000000003	20990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000014	10000000-0000-0001-0000-000000000003	20990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000015	10000000-0000-0001-0000-000000000003	23990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000016	10000000-0000-0001-0000-000000000003	23990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000017	10000000-0000-0001-0000-000000000004	4990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000018	10000000-0000-0001-0000-000000000004	4990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000019	10000000-0000-0001-0000-000000000004	6990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000020	10000000-0000-0001-0000-000000000004	6990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000021	10000000-0000-0001-0000-000000000005	36990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000022	10000000-0000-0001-0000-000000000005	36990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000023	10000000-0000-0001-0000-000000000005	39990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000024	10000000-0000-0001-0000-000000000005	39990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000025	10000000-0000-0001-0000-000000000006	22990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000026	10000000-0000-0001-0000-000000000006	22990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000027	10000000-0000-0001-0000-000000000006	24990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000028	10000000-0000-0001-0000-000000000006	24990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000029	10000000-0000-0001-0000-000000000007	31490000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000030	10000000-0000-0001-0000-000000000007	31490000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000031	10000000-0000-0001-0000-000000000007	34490000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000032	10000000-0000-0001-0000-000000000007	34490000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000033	10000000-0000-0001-0000-000000000008	18990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000034	10000000-0000-0001-0000-000000000008	18990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000035	10000000-0000-0001-0000-000000000008	20990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000036	10000000-0000-0001-0000-000000000008	20990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000037	10000000-0000-0001-0000-000000000009	13490000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000038	10000000-0000-0001-0000-000000000009	13490000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000041	10000000-0000-0001-0000-000000000010	38990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000042	10000000-0000-0001-0000-000000000010	38990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000043	10000000-0000-0001-0000-000000000011	21990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000044	10000000-0000-0001-0000-000000000011	21990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000045	10000000-0000-0001-0000-000000000011	23990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000046	10000000-0000-0001-0000-000000000011	23990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000047	10000000-0000-0001-0000-000000000012	43990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000048	10000000-0000-0001-0000-000000000012	43990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000049	10000000-0000-0001-0000-000000000012	46990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000050	10000000-0000-0001-0000-000000000012	46990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000051	10000000-0000-0001-0000-000000000013	26990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000052	10000000-0000-0001-0000-000000000013	26990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000053	10000000-0000-0001-0000-000000000013	29990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000054	10000000-0000-0001-0000-000000000013	29990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000055	10000000-0000-0001-0000-000000000014	9690000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000056	10000000-0000-0001-0000-000000000014	9690000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000057	10000000-0000-0001-0000-000000000014	11690000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000058	10000000-0000-0001-0000-000000000014	11690000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000059	10000000-0000-0001-0000-000000000015	4490000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000060	10000000-0000-0001-0000-000000000015	4490000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000061	10000000-0000-0001-0000-000000000016	34990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000062	10000000-0000-0001-0000-000000000016	34990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000063	10000000-0000-0001-0000-000000000016	38990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000064	10000000-0000-0001-0000-000000000016	38990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000065	10000000-0000-0001-0000-000000000017	17990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000066	10000000-0000-0001-0000-000000000017	17990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000067	10000000-0000-0001-0000-000000000017	20990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000068	10000000-0000-0001-0000-000000000017	20990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000069	10000000-0000-0001-0000-000000000018	10990000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000070	10000000-0000-0001-0000-000000000018	10990000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000071	10000000-0000-0001-0000-000000000018	13990000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000072	10000000-0000-0001-0000-000000000018	13990000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000073	10000000-0000-0001-0000-000000000019	9890000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000074	10000000-0000-0001-0000-000000000019	9890000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000075	10000000-0000-0001-0000-000000000019	12890000	19	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000076	10000000-0000-0001-0000-000000000019	12890000	26	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000077	10000000-0000-0001-0000-000000000020	3190000	5	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
13000000-0000-0000-0000-000000000078	10000000-0000-0001-0000-000000000020	3190000	12	t	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00
aaaaaaaa-1111-1111-1111-111111111112	aaaaaaaa-1111-1111-1111-111111111111	10000000	10	t	2026-11-12 13:51:13.866956+00	2026-11-12 13:51:13.866956+00
13000000-0000-0000-0000-000000000039	10000000-0000-0001-0000-000000000010	35990000	4	t	2026-11-12 13:49:14.284466+00	2026-11-13 04:32:49.841757+00
13000000-0000-0000-0000-000000000040	10000000-0000-0001-0000-000000000010	35990000	11	t	2026-11-12 13:49:14.284466+00	2026-11-13 04:32:49.841757+00
13000000-0000-0000-0000-000000000079	10000000-0000-0001-0000-000000000021	24990000	15	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000080	10000000-0000-0001-0000-000000000021	24990000	12	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000081	10000000-0000-0001-0000-000000000021	27990000	11	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000082	10000000-0000-0001-0000-000000000021	27990000	10	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000083	10000000-0000-0001-0000-000000000022	26990000	12	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000084	10000000-0000-0001-0000-000000000022	26990000	10	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000085	10000000-0000-0001-0000-000000000022	29990000	10	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000086	10000000-0000-0001-0000-000000000022	29990000	8	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000087	10000000-0000-0001-0000-000000000023	22990000	14	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000088	10000000-0000-0001-0000-000000000023	22990000	10	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000089	10000000-0000-0001-0000-000000000023	25990000	12	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
13000000-0000-0000-0000-000000000090	10000000-0000-0001-0000-000000000023	25990000	8	t	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, category_id, name, description, price, currency, stock_quantity, created_at, updated_at, model, featured, active, brand) FROM stdin;
10000000-0000-0001-0000-000000000005	10000000-0000-0000-0000-000000000001	iPhone 16 Pro Max	Màn hình Super Retina XDR 6.9 inch, chip A18 Pro và nút Điều Khiển Camera mới.	36990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	A3297	t	t	Apple
10000000-0000-0001-0000-000000000006	10000000-0000-0000-0000-000000000001	iPhone 16	Chip A18 thông minh, camera Fusion 48MP và các màu sắc rực rỡ trẻ trung.	22990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	A3288	t	t	Apple
10000000-0000-0001-0000-000000000007	10000000-0000-0000-0000-000000000001	iPhone 15 Pro Max	Thiết kế khung viền titan siêu nhẹ, chip A17 Pro cùng camera tele 5x ấn tượng.	31490000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	A3106	f	t	Apple
10000000-0000-0001-0000-000000000008	10000000-0000-0000-0000-000000000001	iPhone 15	Dynamic Island tiện ích, mặt kính pha màu bền bỉ và cổng sạc USB-C tiện dụng.	18990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	A3090	f	t	Apple
10000000-0000-0001-0000-000000000009	10000000-0000-0000-0000-000000000001	iPhone 13	Smartphone quốc dân với màn hình Super Retina XDR OLED cùng chip A15 Bionic bền bỉ.	13490000.00	VND	17	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	A2633	f	t	Apple
10000000-0000-0001-0000-000000000010	10000000-0000-0000-0000-000000000001	Samsung Galaxy S25 Ultra	Flagship AI đỉnh cao trang bị Snapdragon 8 Elite, bút S Pen và camera 200MP đột phá.	35990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	SM-S938B	t	t	Samsung
10000000-0000-0001-0000-000000000011	10000000-0000-0000-0000-000000000001	Samsung Galaxy S25	Thiết kế thanh lịch gọn gàng, vi xử lý thế hệ mới với bộ công cụ trợ lý Galaxy AI.	21990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	SM-S931B	t	t	Samsung
10000000-0000-0001-0000-000000000012	10000000-0000-0000-0000-000000000001	Samsung Galaxy Z Fold6	Tuyệt tác màn hình gập cao cấp, hiệu năng đa nhiệm không giới hạn cùng Galaxy AI.	43990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	SM-F956B	t	t	Samsung
10000000-0000-0001-0000-000000000013	10000000-0000-0000-0000-000000000001	Samsung Galaxy Z Flip6	Gập vỏ sò thời thượng, màn hình ngoài Flex Window 3.4 inch độc đáo và camera sắc nét.	26990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	SM-F741B	f	t	Samsung
10000000-0000-0001-0000-000000000014	10000000-0000-0000-0000-000000000001	Samsung Galaxy A55 5G	Thiết kế khung kim loại sang trọng, camera chống rung OIS và bảo mật Knox Vault.	9690000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	SM-A556B	f	t	Samsung
10000000-0000-0001-0000-000000000015	10000000-0000-0000-0000-000000000001	Samsung Galaxy A15	Màn hình Super AMOLED 90Hz rực rỡ, pin 5000mAh và sạc nhanh 25W phân khúc phổ thông.	4490000.00	VND	17	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	SM-A155F	f	t	Samsung
10000000-0000-0001-0000-000000000016	10000000-0000-0000-0000-000000000001	Xiaomi 15 Ultra	Siêu phẩm nhiếp ảnh di động Leica thế hệ mới với cảm biến 1 inch và ống kính tele 200MP.	34990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	25010PN30G	t	t	Xiaomi
10000000-0000-0001-0000-000000000001	10000000-0000-0000-0000-000000000001	iPhone 16 Pro	Khung titan nhẹ bền, chip A18 Pro mạnh mẽ cùng hệ thống camera Pro 48MP và nút Điều Khiển Camera.	28990000.00	VND	136	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	A3294	t	t	Apple
10000000-0000-0001-0000-000000000002	10000000-0000-0000-0000-000000000001	iPhone 16e	Thiết kế gọn nhẹ, chip A18, camera Fusion 48MP và thời lượng pin ấn tượng trong tầm giá dễ tiếp cận.	16990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	A3409	f	t	Apple
10000000-0000-0001-0000-000000000003	10000000-0000-0000-0000-000000000001	Xiaomi 15	Flagship nhỏ gọn với chip Snapdragon 8 Elite, cụm camera Leica và màn hình AMOLED 120Hz viền siêu mỏng.	20990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	24129PN74G	t	t	Xiaomi
10000000-0000-0001-0000-000000000004	10000000-0000-0000-0000-000000000001	Redmi Note 14	Màn hình AMOLED sáng rõ, pin 5500mAh và camera 108MP đáp ứng tốt nhu cầu học tập, giải trí hằng ngày.	4990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	23117RA68G	f	t	Xiaomi
10000000-0000-0001-0000-000000000017	10000000-0000-0000-0000-000000000001	Xiaomi 14T Pro	Chip MediaTek Dimensity 9300+, camera Leica chuyên nghiệp và sạc siêu tốc 120W.	17990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	2407FPN8EG	f	t	Xiaomi
10000000-0000-0001-0000-000000000018	10000000-0000-0000-0000-000000000001	Redmi Note 14 Pro+	Màn hình cong 1.5K AMOLED 120Hz, camera 200MP OIS siêu nét và pin 6200mAh.	10990000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	24090RA29G	f	t	Xiaomi
10000000-0000-0001-0000-000000000019	10000000-0000-0000-0000-000000000001	POCO X7 Pro	Quái thú hiệu năng tầm trung với chip Dimensity 8400-Ultra và tản nhiệt buồng hơi lớn.	9890000.00	VND	62	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	24122RKC7G	f	t	Xiaomi
10000000-0000-0001-0000-000000000020	10000000-0000-0000-0000-000000000001	Redmi 14C	Màn hình cực đại 6.88 inch 120Hz, thiết kế mặt lưng kính sang trọng với mức giá tốt nhất.	3190000.00	VND	17	2026-11-12 13:49:14.284466+00	2026-11-12 13:49:14.284466+00	2409BRN2CG	f	t	Xiaomi
aaaaaaaa-1111-1111-1111-111111111111	10000000-0000-0000-0000-000000000001	Reviewed Phone	Description	10000000.00	VND	10	2026-11-12 13:51:13.858971+00	2026-11-12 13:51:13.858971+00	RP-1	t	t	TestBrand
10000000-0000-0001-0000-000000000021	10000000-0000-0000-0000-000000000001	OPPO Find X8 Pro	Cụm camera Hasselblad 50MP, chip Dimensity 9400 và pin 5910mAh, thiết kế mỏng nhẹ đạt chuẩn kháng nước IP68/IP69.	24990000.00	VND	48	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00	CPH2659	t	t	OPPO
10000000-0000-0001-0000-000000000022	10000000-0000-0000-0000-000000000001	vivo X200 Pro	Camera ZEISS 200MP tele tiềm vọng, chip Dimensity 9400 và pin 6000mAh, màn hình LTPO AMOLED 120Hz cao cấp.	26990000.00	VND	40	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00	V2413	t	t	vivo
10000000-0000-0001-0000-000000000023	10000000-0000-0000-0000-000000000001	OnePlus 13	Chip Snapdragon 8 Elite, màn hình LTPO AMOLED 2K 120Hz và pin 6000mAh sạc nhanh 100W, hiệu năng flagship toàn diện.	22990000.00	VND	44	2026-11-13 04:51:42.040549+00	2026-11-13 04:53:39.655957+00	CPH2653	t	t	OnePlus
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) FROM stdin;
7213bf7a-86a9-488f-9dab-ff74e6cf40cb	ededb01d-da93-47a8-989b-f513f7d5ed20	e5439468af46029b30cd30f4ae292a26de5bb81abf2843273f8d172ed6b7ad5d	2026-12-13 04:06:30.142103+00	\N	2026-11-13 04:06:30.684768+00
3bd9db4f-d508-4ef4-9258-11a7902757c8	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	91763554a297599dbe97e7856ab437616a0d0c2725fe221bd2f6d52999ecc116	2026-12-13 04:06:32.654117+00	\N	2026-11-13 04:06:32.985648+00
9cf69b8e-0665-4b0e-be14-5b421b498a11	ededb01d-da93-47a8-989b-f513f7d5ed20	76fc946383f54a100c881b1fb9c55330313f51d372fd1b4bc2218d919fca9403	2026-12-13 04:06:50.934209+00	\N	2026-11-13 04:06:52.53356+00
b9e0fb38-fbc8-4f2f-a25a-516bee1f63a1	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	3c32bfebfbae1ae07e9a2348396ad8436671728d99885cd1f3d9a2479464ee8d	2026-12-13 04:06:53.168309+00	\N	2026-11-13 04:06:54.667868+00
a4badb35-28e8-4a75-b4e9-5b31d92b65c2	ededb01d-da93-47a8-989b-f513f7d5ed20	977a836b543043466f8c926d861e9aec563039a2a9d62d0e8cd60dda43d5a1c1	2026-12-13 04:07:24.759075+00	\N	2026-11-13 04:07:25.995911+00
b1071c36-8050-4c60-b486-97e79a2cb44e	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	70ab9c6ad0abbe2436c92734678f431b9f481f1da9766f5bcbf8774d10f7c87c	2026-12-13 04:09:45.980457+00	2026-11-13 04:24:48.17577+00	2026-11-13 04:09:46.391113+00
269b89a3-f028-46ee-8cf3-e6d6ee754c7b	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	5c55fb3e1535d2f6f7f2350cd7484f5b73b8f0db45c7f299f789b008411c3064	2026-12-13 04:24:47.177913+00	2026-11-13 04:25:15.451313+00	2026-11-13 04:24:48.181352+00
1b39445f-6b2e-493e-a1f8-e7d8f3ad4332	f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	33e9fce96b36067fce6c00fb4324b035f54c7aebab96f06315df614ab8bf0420	2026-12-13 04:25:13.574476+00	\N	2026-11-13 04:25:15.455198+00
a824b952-39d1-4c1c-9d32-866a263f51f7	ededb01d-da93-47a8-989b-f513f7d5ed20	80f9ddc1022b1bc67e1daf4bed24d89f695f6307d34f9eb1bdcefca493c79ccc	2026-12-13 04:27:49.071038+00	2026-11-13 04:50:22.903076+00	2026-11-13 04:27:51.07833+00
74fe81e7-ca85-43f5-9e51-f3ecfa438ae9	ededb01d-da93-47a8-989b-f513f7d5ed20	02d16e17caf47c8fddefc8bfd0ce4534f601c24b4b4a851ef5c4b7aebab339f5	2026-12-13 04:50:22.159945+00	\N	2026-11-13 04:50:22.910419+00
\.


--
-- Data for Name: return_request_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.return_request_items (id, return_request_id, order_item_id, quantity, received_variant_id) FROM stdin;
\.


--
-- Data for Name: return_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.return_requests (id, order_id, user_id, status, reason_code, description, reject_reason, refund_amount_vnd, refunded_by_user_id, created_at, updated_at, approved_at, rejected_at, received_at, refunded_at, cancelled_at, expected_refund_amount_vnd) FROM stdin;
\.


--
-- Data for Name: review_helpfulness_votes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.review_helpfulness_votes (id, user_id, review_id, reply_id, vote, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: review_media; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.review_media (id, review_id, media_type, mime_type, object_key, size_bytes, "position", created_at) FROM stdin;
\.


--
-- Data for Name: review_replies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.review_replies (id, review_id, content, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_migrations (version, dirty) FROM stdin;
21	f
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, created_at, updated_at, role, status, locked_at, lock_reason, last_active_at) FROM stdin;
22222222-1111-1111-1111-222222222222	cust2@example.com	hash	2026-11-12 13:50:58.031192+00	2026-11-12 13:50:58.031192+00	customer	active	\N	\N	\N
22222222-1111-1111-1111-333333333333	admin_chat@example.com	hash	2026-11-12 13:50:58.031192+00	2026-11-12 13:50:58.031192+00	admin	active	\N	\N	\N
11111111-2222-3333-4444-555555555551	reviewer@example.com	hash	2026-11-12 13:51:13.845291+00	2026-11-12 13:51:13.845291+00	customer	active	\N	\N	\N
11111111-2222-3333-4444-555555555552	other@example.com	hash	2026-11-12 13:51:13.845291+00	2026-11-12 13:51:13.845291+00	customer	active	\N	\N	\N
f4cfc8e1-97ae-4227-b74f-9c0f167d73b8	admin@example.com	$2a$10$Zmyd508HRwCVCV4YsrOv3u7Iv9LsfGZ8n7M6jq56BGUakZ1AlI.bm	2026-11-13 04:06:32.982034+00	2026-11-13 04:06:32.982034+00	admin	active	\N	\N	2026-11-13 04:52:27.497679+00
ededb01d-da93-47a8-989b-f513f7d5ed20	customer@example.com	$2a$10$N53bUcgy5mHYjTY77sIyE.HyA1l3.2CSdPhdUwEAoRO3Q64PgY2Su	2026-11-13 04:06:30.674247+00	2026-11-13 04:06:30.674247+00	customer	active	\N	\N	2026-11-13 04:52:28.568827+00
22222222-1111-1111-1111-111111111111	cust1@example.com	hash	2026-11-12 13:50:58.031192+00	2026-11-12 13:50:58.031192+00	customer	active	\N	\N	\N
\.


--
-- Data for Name: variant_option_values; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.variant_option_values (variant_id, product_id, group_id, option_value_id) FROM stdin;
13000000-0000-0000-0000-000000000001	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000001
13000000-0000-0000-0000-000000000001	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000003
13000000-0000-0000-0000-000000000001	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000005
13000000-0000-0000-0000-000000000002	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000001
13000000-0000-0000-0000-000000000002	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000003
13000000-0000-0000-0000-000000000002	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000006
13000000-0000-0000-0000-000000000003	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000001
13000000-0000-0000-0000-000000000003	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000004
13000000-0000-0000-0000-000000000003	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000005
13000000-0000-0000-0000-000000000004	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000001
13000000-0000-0000-0000-000000000004	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000004
13000000-0000-0000-0000-000000000004	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000006
13000000-0000-0000-0000-000000000005	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000002
13000000-0000-0000-0000-000000000005	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000003
13000000-0000-0000-0000-000000000005	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000005
13000000-0000-0000-0000-000000000006	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000002
13000000-0000-0000-0000-000000000006	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000003
13000000-0000-0000-0000-000000000006	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000006
13000000-0000-0000-0000-000000000007	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000002
13000000-0000-0000-0000-000000000007	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000004
13000000-0000-0000-0000-000000000007	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000005
13000000-0000-0000-0000-000000000008	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000001	12000000-0000-0000-0000-000000000002
13000000-0000-0000-0000-000000000008	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000002	12000000-0000-0000-0000-000000000004
13000000-0000-0000-0000-000000000008	10000000-0000-0001-0000-000000000001	11000000-0000-0000-0000-000000000003	12000000-0000-0000-0000-000000000006
13000000-0000-0000-0000-000000000009	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000004	12000000-0000-0000-0000-000000000007
13000000-0000-0000-0000-000000000009	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000005	12000000-0000-0000-0000-000000000009
13000000-0000-0000-0000-000000000010	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000004	12000000-0000-0000-0000-000000000007
13000000-0000-0000-0000-000000000010	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000005	12000000-0000-0000-0000-000000000010
13000000-0000-0000-0000-000000000011	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000004	12000000-0000-0000-0000-000000000008
13000000-0000-0000-0000-000000000011	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000005	12000000-0000-0000-0000-000000000009
13000000-0000-0000-0000-000000000012	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000004	12000000-0000-0000-0000-000000000008
13000000-0000-0000-0000-000000000012	10000000-0000-0001-0000-000000000002	11000000-0000-0000-0000-000000000005	12000000-0000-0000-0000-000000000010
13000000-0000-0000-0000-000000000013	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000006	12000000-0000-0000-0000-000000000011
13000000-0000-0000-0000-000000000013	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000007	12000000-0000-0000-0000-000000000013
13000000-0000-0000-0000-000000000014	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000006	12000000-0000-0000-0000-000000000011
13000000-0000-0000-0000-000000000014	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000007	12000000-0000-0000-0000-000000000014
13000000-0000-0000-0000-000000000015	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000006	12000000-0000-0000-0000-000000000012
13000000-0000-0000-0000-000000000015	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000007	12000000-0000-0000-0000-000000000013
13000000-0000-0000-0000-000000000016	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000006	12000000-0000-0000-0000-000000000012
13000000-0000-0000-0000-000000000016	10000000-0000-0001-0000-000000000003	11000000-0000-0000-0000-000000000007	12000000-0000-0000-0000-000000000014
13000000-0000-0000-0000-000000000017	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000008	12000000-0000-0000-0000-000000000015
13000000-0000-0000-0000-000000000017	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000009	12000000-0000-0000-0000-000000000017
13000000-0000-0000-0000-000000000018	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000008	12000000-0000-0000-0000-000000000015
13000000-0000-0000-0000-000000000018	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000009	12000000-0000-0000-0000-000000000018
13000000-0000-0000-0000-000000000019	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000008	12000000-0000-0000-0000-000000000016
13000000-0000-0000-0000-000000000019	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000009	12000000-0000-0000-0000-000000000017
13000000-0000-0000-0000-000000000020	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000008	12000000-0000-0000-0000-000000000016
13000000-0000-0000-0000-000000000020	10000000-0000-0001-0000-000000000004	11000000-0000-0000-0000-000000000009	12000000-0000-0000-0000-000000000018
13000000-0000-0000-0000-000000000021	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000010	12000000-0000-0000-0000-000000000019
13000000-0000-0000-0000-000000000021	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000011	12000000-0000-0000-0000-000000000021
13000000-0000-0000-0000-000000000022	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000010	12000000-0000-0000-0000-000000000019
13000000-0000-0000-0000-000000000022	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000011	12000000-0000-0000-0000-000000000022
13000000-0000-0000-0000-000000000023	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000010	12000000-0000-0000-0000-000000000020
13000000-0000-0000-0000-000000000023	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000011	12000000-0000-0000-0000-000000000021
13000000-0000-0000-0000-000000000024	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000010	12000000-0000-0000-0000-000000000020
13000000-0000-0000-0000-000000000024	10000000-0000-0001-0000-000000000005	11000000-0000-0000-0000-000000000011	12000000-0000-0000-0000-000000000022
13000000-0000-0000-0000-000000000025	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000012	12000000-0000-0000-0000-000000000023
13000000-0000-0000-0000-000000000025	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000013	12000000-0000-0000-0000-000000000025
13000000-0000-0000-0000-000000000026	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000012	12000000-0000-0000-0000-000000000023
13000000-0000-0000-0000-000000000026	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000013	12000000-0000-0000-0000-000000000026
13000000-0000-0000-0000-000000000027	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000012	12000000-0000-0000-0000-000000000024
13000000-0000-0000-0000-000000000027	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000013	12000000-0000-0000-0000-000000000025
13000000-0000-0000-0000-000000000028	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000012	12000000-0000-0000-0000-000000000024
13000000-0000-0000-0000-000000000028	10000000-0000-0001-0000-000000000006	11000000-0000-0000-0000-000000000013	12000000-0000-0000-0000-000000000026
13000000-0000-0000-0000-000000000029	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000014	12000000-0000-0000-0000-000000000027
13000000-0000-0000-0000-000000000029	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000015	12000000-0000-0000-0000-000000000029
13000000-0000-0000-0000-000000000030	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000014	12000000-0000-0000-0000-000000000027
13000000-0000-0000-0000-000000000030	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000015	12000000-0000-0000-0000-000000000030
13000000-0000-0000-0000-000000000031	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000014	12000000-0000-0000-0000-000000000028
13000000-0000-0000-0000-000000000031	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000015	12000000-0000-0000-0000-000000000029
13000000-0000-0000-0000-000000000032	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000014	12000000-0000-0000-0000-000000000028
13000000-0000-0000-0000-000000000032	10000000-0000-0001-0000-000000000007	11000000-0000-0000-0000-000000000015	12000000-0000-0000-0000-000000000030
13000000-0000-0000-0000-000000000033	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000016	12000000-0000-0000-0000-000000000031
13000000-0000-0000-0000-000000000033	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000017	12000000-0000-0000-0000-000000000033
13000000-0000-0000-0000-000000000034	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000016	12000000-0000-0000-0000-000000000031
13000000-0000-0000-0000-000000000034	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000017	12000000-0000-0000-0000-000000000034
13000000-0000-0000-0000-000000000035	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000016	12000000-0000-0000-0000-000000000032
13000000-0000-0000-0000-000000000035	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000017	12000000-0000-0000-0000-000000000033
13000000-0000-0000-0000-000000000036	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000016	12000000-0000-0000-0000-000000000032
13000000-0000-0000-0000-000000000036	10000000-0000-0001-0000-000000000008	11000000-0000-0000-0000-000000000017	12000000-0000-0000-0000-000000000034
13000000-0000-0000-0000-000000000037	10000000-0000-0001-0000-000000000009	11000000-0000-0000-0000-000000000018	12000000-0000-0000-0000-000000000035
13000000-0000-0000-0000-000000000037	10000000-0000-0001-0000-000000000009	11000000-0000-0000-0000-000000000019	12000000-0000-0000-0000-000000000036
13000000-0000-0000-0000-000000000038	10000000-0000-0001-0000-000000000009	11000000-0000-0000-0000-000000000018	12000000-0000-0000-0000-000000000035
13000000-0000-0000-0000-000000000038	10000000-0000-0001-0000-000000000009	11000000-0000-0000-0000-000000000019	12000000-0000-0000-0000-000000000037
13000000-0000-0000-0000-000000000039	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000020	12000000-0000-0000-0000-000000000038
13000000-0000-0000-0000-000000000039	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000021	12000000-0000-0000-0000-000000000040
13000000-0000-0000-0000-000000000040	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000020	12000000-0000-0000-0000-000000000038
13000000-0000-0000-0000-000000000040	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000021	12000000-0000-0000-0000-000000000041
13000000-0000-0000-0000-000000000041	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000020	12000000-0000-0000-0000-000000000039
13000000-0000-0000-0000-000000000041	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000021	12000000-0000-0000-0000-000000000040
13000000-0000-0000-0000-000000000042	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000020	12000000-0000-0000-0000-000000000039
13000000-0000-0000-0000-000000000042	10000000-0000-0001-0000-000000000010	11000000-0000-0000-0000-000000000021	12000000-0000-0000-0000-000000000041
13000000-0000-0000-0000-000000000043	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000022	12000000-0000-0000-0000-000000000042
13000000-0000-0000-0000-000000000043	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000023	12000000-0000-0000-0000-000000000044
13000000-0000-0000-0000-000000000044	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000022	12000000-0000-0000-0000-000000000042
13000000-0000-0000-0000-000000000044	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000023	12000000-0000-0000-0000-000000000045
13000000-0000-0000-0000-000000000045	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000022	12000000-0000-0000-0000-000000000043
13000000-0000-0000-0000-000000000045	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000023	12000000-0000-0000-0000-000000000044
13000000-0000-0000-0000-000000000046	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000022	12000000-0000-0000-0000-000000000043
13000000-0000-0000-0000-000000000046	10000000-0000-0001-0000-000000000011	11000000-0000-0000-0000-000000000023	12000000-0000-0000-0000-000000000045
13000000-0000-0000-0000-000000000047	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000024	12000000-0000-0000-0000-000000000046
13000000-0000-0000-0000-000000000047	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000025	12000000-0000-0000-0000-000000000048
13000000-0000-0000-0000-000000000048	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000024	12000000-0000-0000-0000-000000000046
13000000-0000-0000-0000-000000000048	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000025	12000000-0000-0000-0000-000000000049
13000000-0000-0000-0000-000000000049	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000024	12000000-0000-0000-0000-000000000047
13000000-0000-0000-0000-000000000049	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000025	12000000-0000-0000-0000-000000000048
13000000-0000-0000-0000-000000000050	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000024	12000000-0000-0000-0000-000000000047
13000000-0000-0000-0000-000000000050	10000000-0000-0001-0000-000000000012	11000000-0000-0000-0000-000000000025	12000000-0000-0000-0000-000000000049
13000000-0000-0000-0000-000000000051	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000026	12000000-0000-0000-0000-000000000050
13000000-0000-0000-0000-000000000051	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000027	12000000-0000-0000-0000-000000000052
13000000-0000-0000-0000-000000000052	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000026	12000000-0000-0000-0000-000000000050
13000000-0000-0000-0000-000000000052	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000027	12000000-0000-0000-0000-000000000053
13000000-0000-0000-0000-000000000053	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000026	12000000-0000-0000-0000-000000000051
13000000-0000-0000-0000-000000000053	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000027	12000000-0000-0000-0000-000000000052
13000000-0000-0000-0000-000000000054	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000026	12000000-0000-0000-0000-000000000051
13000000-0000-0000-0000-000000000054	10000000-0000-0001-0000-000000000013	11000000-0000-0000-0000-000000000027	12000000-0000-0000-0000-000000000053
13000000-0000-0000-0000-000000000055	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000028	12000000-0000-0000-0000-000000000054
13000000-0000-0000-0000-000000000055	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000029	12000000-0000-0000-0000-000000000056
13000000-0000-0000-0000-000000000056	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000028	12000000-0000-0000-0000-000000000054
13000000-0000-0000-0000-000000000056	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000029	12000000-0000-0000-0000-000000000057
13000000-0000-0000-0000-000000000057	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000028	12000000-0000-0000-0000-000000000055
13000000-0000-0000-0000-000000000057	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000029	12000000-0000-0000-0000-000000000056
13000000-0000-0000-0000-000000000058	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000028	12000000-0000-0000-0000-000000000055
13000000-0000-0000-0000-000000000058	10000000-0000-0001-0000-000000000014	11000000-0000-0000-0000-000000000029	12000000-0000-0000-0000-000000000057
13000000-0000-0000-0000-000000000059	10000000-0000-0001-0000-000000000015	11000000-0000-0000-0000-000000000030	12000000-0000-0000-0000-000000000058
13000000-0000-0000-0000-000000000059	10000000-0000-0001-0000-000000000015	11000000-0000-0000-0000-000000000031	12000000-0000-0000-0000-000000000059
13000000-0000-0000-0000-000000000060	10000000-0000-0001-0000-000000000015	11000000-0000-0000-0000-000000000030	12000000-0000-0000-0000-000000000058
13000000-0000-0000-0000-000000000060	10000000-0000-0001-0000-000000000015	11000000-0000-0000-0000-000000000031	12000000-0000-0000-0000-000000000060
13000000-0000-0000-0000-000000000061	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000032	12000000-0000-0000-0000-000000000061
13000000-0000-0000-0000-000000000061	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000033	12000000-0000-0000-0000-000000000063
13000000-0000-0000-0000-000000000062	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000032	12000000-0000-0000-0000-000000000061
13000000-0000-0000-0000-000000000062	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000033	12000000-0000-0000-0000-000000000064
13000000-0000-0000-0000-000000000063	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000032	12000000-0000-0000-0000-000000000062
13000000-0000-0000-0000-000000000063	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000033	12000000-0000-0000-0000-000000000063
13000000-0000-0000-0000-000000000064	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000032	12000000-0000-0000-0000-000000000062
13000000-0000-0000-0000-000000000064	10000000-0000-0001-0000-000000000016	11000000-0000-0000-0000-000000000033	12000000-0000-0000-0000-000000000064
13000000-0000-0000-0000-000000000065	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000034	12000000-0000-0000-0000-000000000065
13000000-0000-0000-0000-000000000065	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000035	12000000-0000-0000-0000-000000000067
13000000-0000-0000-0000-000000000066	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000034	12000000-0000-0000-0000-000000000065
13000000-0000-0000-0000-000000000066	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000035	12000000-0000-0000-0000-000000000068
13000000-0000-0000-0000-000000000067	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000034	12000000-0000-0000-0000-000000000066
13000000-0000-0000-0000-000000000067	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000035	12000000-0000-0000-0000-000000000067
13000000-0000-0000-0000-000000000068	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000034	12000000-0000-0000-0000-000000000066
13000000-0000-0000-0000-000000000068	10000000-0000-0001-0000-000000000017	11000000-0000-0000-0000-000000000035	12000000-0000-0000-0000-000000000068
13000000-0000-0000-0000-000000000069	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000036	12000000-0000-0000-0000-000000000069
13000000-0000-0000-0000-000000000069	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000037	12000000-0000-0000-0000-000000000071
13000000-0000-0000-0000-000000000070	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000036	12000000-0000-0000-0000-000000000069
13000000-0000-0000-0000-000000000070	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000037	12000000-0000-0000-0000-000000000072
13000000-0000-0000-0000-000000000071	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000036	12000000-0000-0000-0000-000000000070
13000000-0000-0000-0000-000000000071	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000037	12000000-0000-0000-0000-000000000071
13000000-0000-0000-0000-000000000072	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000036	12000000-0000-0000-0000-000000000070
13000000-0000-0000-0000-000000000072	10000000-0000-0001-0000-000000000018	11000000-0000-0000-0000-000000000037	12000000-0000-0000-0000-000000000072
13000000-0000-0000-0000-000000000073	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000038	12000000-0000-0000-0000-000000000073
13000000-0000-0000-0000-000000000073	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000039	12000000-0000-0000-0000-000000000075
13000000-0000-0000-0000-000000000074	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000038	12000000-0000-0000-0000-000000000073
13000000-0000-0000-0000-000000000074	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000039	12000000-0000-0000-0000-000000000076
13000000-0000-0000-0000-000000000075	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000038	12000000-0000-0000-0000-000000000074
13000000-0000-0000-0000-000000000075	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000039	12000000-0000-0000-0000-000000000075
13000000-0000-0000-0000-000000000076	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000038	12000000-0000-0000-0000-000000000074
13000000-0000-0000-0000-000000000076	10000000-0000-0001-0000-000000000019	11000000-0000-0000-0000-000000000039	12000000-0000-0000-0000-000000000076
13000000-0000-0000-0000-000000000077	10000000-0000-0001-0000-000000000020	11000000-0000-0000-0000-000000000040	12000000-0000-0000-0000-000000000077
13000000-0000-0000-0000-000000000077	10000000-0000-0001-0000-000000000020	11000000-0000-0000-0000-000000000041	12000000-0000-0000-0000-000000000078
13000000-0000-0000-0000-000000000078	10000000-0000-0001-0000-000000000020	11000000-0000-0000-0000-000000000040	12000000-0000-0000-0000-000000000077
13000000-0000-0000-0000-000000000078	10000000-0000-0001-0000-000000000020	11000000-0000-0000-0000-000000000041	12000000-0000-0000-0000-000000000079
13000000-0000-0000-0000-000000000079	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000042	12000000-0000-0000-0000-000000000080
13000000-0000-0000-0000-000000000079	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000043	12000000-0000-0000-0000-000000000082
13000000-0000-0000-0000-000000000080	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000042	12000000-0000-0000-0000-000000000080
13000000-0000-0000-0000-000000000080	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000043	12000000-0000-0000-0000-000000000083
13000000-0000-0000-0000-000000000081	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000042	12000000-0000-0000-0000-000000000081
13000000-0000-0000-0000-000000000081	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000043	12000000-0000-0000-0000-000000000082
13000000-0000-0000-0000-000000000082	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000042	12000000-0000-0000-0000-000000000081
13000000-0000-0000-0000-000000000082	10000000-0000-0001-0000-000000000021	11000000-0000-0000-0000-000000000043	12000000-0000-0000-0000-000000000083
13000000-0000-0000-0000-000000000083	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000044	12000000-0000-0000-0000-000000000084
13000000-0000-0000-0000-000000000083	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000045	12000000-0000-0000-0000-000000000086
13000000-0000-0000-0000-000000000084	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000044	12000000-0000-0000-0000-000000000084
13000000-0000-0000-0000-000000000084	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000045	12000000-0000-0000-0000-000000000087
13000000-0000-0000-0000-000000000085	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000044	12000000-0000-0000-0000-000000000085
13000000-0000-0000-0000-000000000085	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000045	12000000-0000-0000-0000-000000000086
13000000-0000-0000-0000-000000000086	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000044	12000000-0000-0000-0000-000000000085
13000000-0000-0000-0000-000000000086	10000000-0000-0001-0000-000000000022	11000000-0000-0000-0000-000000000045	12000000-0000-0000-0000-000000000087
13000000-0000-0000-0000-000000000087	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000046	12000000-0000-0000-0000-000000000088
13000000-0000-0000-0000-000000000087	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000047	12000000-0000-0000-0000-000000000090
13000000-0000-0000-0000-000000000088	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000046	12000000-0000-0000-0000-000000000088
13000000-0000-0000-0000-000000000088	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000047	12000000-0000-0000-0000-000000000091
13000000-0000-0000-0000-000000000089	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000046	12000000-0000-0000-0000-000000000089
13000000-0000-0000-0000-000000000089	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000047	12000000-0000-0000-0000-000000000090
13000000-0000-0000-0000-000000000090	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000046	12000000-0000-0000-0000-000000000089
13000000-0000-0000-0000-000000000090	10000000-0000-0001-0000-000000000023	11000000-0000-0000-0000-000000000047	12000000-0000-0000-0000-000000000091
\.


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_user_id_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_variant_id_key UNIQUE (user_id, variant_id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: chat_attachments chat_attachments_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_object_key_key UNIQUE (object_key);


--
-- Name: chat_attachments chat_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_key UNIQUE (user_id);


--
-- Name: live_comments live_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_comments
    ADD CONSTRAINT live_comments_pkey PRIMARY KEY (id);


--
-- Name: live_session_products live_session_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_session_products
    ADD CONSTRAINT live_session_products_pkey PRIMARY KEY (session_id, product_id);


--
-- Name: live_sessions live_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_sessions
    ADD CONSTRAINT live_sessions_pkey PRIMARY KEY (id);


--
-- Name: live_variant_prices live_variant_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_variant_prices
    ADD CONSTRAINT live_variant_prices_pkey PRIMARY KEY (session_id, variant_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: post_comment_reactions post_comment_reactions_comment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment_reactions
    ADD CONSTRAINT post_comment_reactions_comment_id_user_id_key UNIQUE (comment_id, user_id);


--
-- Name: post_comment_reactions post_comment_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment_reactions
    ADD CONSTRAINT post_comment_reactions_pkey PRIMARY KEY (id);


--
-- Name: post_comments post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);


--
-- Name: post_media post_media_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_object_key_key UNIQUE (object_key);


--
-- Name: post_media post_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_pkey PRIMARY KEY (id);


--
-- Name: post_reactions post_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_pkey PRIMARY KEY (id);


--
-- Name: post_reactions post_reactions_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_post_id_user_id_key UNIQUE (post_id, user_id);


--
-- Name: post_referred_products post_referred_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_referred_products
    ADD CONSTRAINT post_referred_products_pkey PRIMARY KEY (post_id, product_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: product_favorites product_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_favorites
    ADD CONSTRAINT product_favorites_pkey PRIMARY KEY (user_id, product_id);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_option_groups product_option_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_groups
    ADD CONSTRAINT product_option_groups_pkey PRIMARY KEY (id);


--
-- Name: product_option_groups product_option_groups_product_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_groups
    ADD CONSTRAINT product_option_groups_product_id_id_key UNIQUE (product_id, id);


--
-- Name: product_option_groups product_option_groups_product_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_groups
    ADD CONSTRAINT product_option_groups_product_id_label_key UNIQUE (product_id, label);


--
-- Name: product_option_values product_option_values_group_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_values
    ADD CONSTRAINT product_option_values_group_id_label_key UNIQUE (group_id, label);


--
-- Name: product_option_values product_option_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_values
    ADD CONSTRAINT product_option_values_pkey PRIMARY KEY (id);


--
-- Name: product_option_values product_option_values_product_id_group_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_values
    ADD CONSTRAINT product_option_values_product_id_group_id_id_key UNIQUE (product_id, group_id, id);


--
-- Name: product_reviews product_reviews_order_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_order_item_id_key UNIQUE (order_item_id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_product_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_id_key UNIQUE (product_id, id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: return_request_items return_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_request_items
    ADD CONSTRAINT return_request_items_pkey PRIMARY KEY (id);


--
-- Name: return_requests return_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_pkey PRIMARY KEY (id);


--
-- Name: review_helpfulness_votes review_helpfulness_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_pkey PRIMARY KEY (id);


--
-- Name: review_helpfulness_votes review_helpfulness_votes_user_reply_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_user_reply_unique UNIQUE (user_id, reply_id);


--
-- Name: review_helpfulness_votes review_helpfulness_votes_user_review_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_user_review_unique UNIQUE (user_id, review_id);


--
-- Name: review_media review_media_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_media
    ADD CONSTRAINT review_media_object_key_key UNIQUE (object_key);


--
-- Name: review_media review_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_media
    ADD CONSTRAINT review_media_pkey PRIMARY KEY (id);


--
-- Name: review_media review_media_review_id_media_type_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_media
    ADD CONSTRAINT review_media_review_id_media_type_position_key UNIQUE (review_id, media_type, "position");


--
-- Name: review_replies review_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_pkey PRIMARY KEY (id);


--
-- Name: review_replies review_replies_review_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_review_id_key UNIQUE (review_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: variant_option_values variant_option_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_option_values
    ADD CONSTRAINT variant_option_values_pkey PRIMARY KEY (variant_id, group_id);


--
-- Name: addresses_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addresses_user_id_idx ON public.addresses USING btree (user_id);


--
-- Name: addresses_user_id_is_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addresses_user_id_is_default_idx ON public.addresses USING btree (user_id) WHERE is_default;


--
-- Name: cart_items_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cart_items_user_id_created_at_idx ON public.cart_items USING btree (user_id, created_at);


--
-- Name: cart_items_variant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cart_items_variant_id_idx ON public.cart_items USING btree (variant_id);


--
-- Name: categories_name_normalized_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_name_normalized_uidx ON public.categories USING btree (lower(btrim(name)));


--
-- Name: idx_chat_attachments_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_message_id ON public.chat_attachments USING btree (message_id);


--
-- Name: idx_chat_attachments_uploader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_uploader ON public.chat_attachments USING btree (uploader_id);


--
-- Name: idx_chat_messages_attached_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_attached_order ON public.chat_messages USING btree (attached_order_id) WHERE (attached_order_id IS NOT NULL);


--
-- Name: idx_chat_messages_conv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conv_created ON public.chat_messages USING btree (conversation_id, created_at);


--
-- Name: idx_conversations_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message_at ON public.conversations USING btree (last_message_at DESC);


--
-- Name: idx_conversations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user_id ON public.conversations USING btree (user_id);


--
-- Name: idx_notifications_recipient_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient_created ON public.notifications USING btree (recipient_id, created_at DESC, id DESC);


--
-- Name: idx_notifications_recipient_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient_unread ON public.notifications USING btree (recipient_id) WHERE (is_read = false);


--
-- Name: idx_notifications_recipient_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient_updated ON public.notifications USING btree (recipient_id, updated_at DESC, id DESC);


--
-- Name: idx_notifications_unread_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_notifications_unread_group ON public.notifications USING btree (recipient_id, group_key) WHERE ((is_read = false) AND (group_key <> ''::text));


--
-- Name: idx_post_comment_reactions_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comment_reactions_comment_id ON public.post_comment_reactions USING btree (comment_id);


--
-- Name: idx_post_comments_parent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_parent_created ON public.post_comments USING btree (parent_id, created_at, id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_post_comments_post_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_post_created ON public.post_comments USING btree (post_id, created_at, id);


--
-- Name: idx_post_media_post_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_media_post_position ON public.post_media USING btree (post_id, "position") WHERE (post_id IS NOT NULL);


--
-- Name: idx_post_media_uploader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_media_uploader ON public.post_media USING btree (uploader_id);


--
-- Name: idx_post_reactions_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_reactions_post_id ON public.post_reactions USING btree (post_id);


--
-- Name: idx_post_referred_products_post_pos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_referred_products_post_pos ON public.post_referred_products USING btree (post_id, "position");


--
-- Name: idx_posts_created_at_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_created_at_id ON public.posts USING btree (created_at DESC, id DESC);


--
-- Name: idx_review_helpfulness_votes_reply_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_helpfulness_votes_reply_vote ON public.review_helpfulness_votes USING btree (reply_id, vote) WHERE (reply_id IS NOT NULL);


--
-- Name: idx_review_helpfulness_votes_review_vote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_helpfulness_votes_review_vote ON public.review_helpfulness_votes USING btree (review_id, vote) WHERE (review_id IS NOT NULL);


--
-- Name: live_comments_session_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_comments_session_created_idx ON public.live_comments USING btree (session_id, created_at DESC, id DESC);


--
-- Name: live_comments_session_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_comments_session_user_created_idx ON public.live_comments USING btree (session_id, user_id, created_at DESC);


--
-- Name: live_sessions_single_live_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX live_sessions_single_live_idx ON public.live_sessions USING btree ((true)) WHERE (status = 'live'::text);


--
-- Name: order_items_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);


--
-- Name: order_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_product_id_idx ON public.order_items USING btree (product_id);


--
-- Name: order_items_variant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_variant_id_idx ON public.order_items USING btree (variant_id);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at);


--
-- Name: orders_delivered_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_delivered_at_idx ON public.orders USING btree (delivered_at) WHERE (delivered_at IS NOT NULL);


--
-- Name: orders_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_created_at_idx ON public.orders USING btree (status, created_at);


--
-- Name: orders_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_user_id_created_at_idx ON public.orders USING btree (user_id, created_at DESC);


--
-- Name: orders_user_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_user_id_status_idx ON public.orders USING btree (user_id, status);


--
-- Name: product_favorites_user_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_favorites_user_order_idx ON public.product_favorites USING btree (user_id, favorited_at DESC, product_id);


--
-- Name: product_images_product_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_images_product_id_position_idx ON public.product_images USING btree (product_id, "position");


--
-- Name: product_option_groups_product_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_option_groups_product_id_position_idx ON public.product_option_groups USING btree (product_id, "position");


--
-- Name: product_option_values_product_group_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_option_values_product_group_position_idx ON public.product_option_values USING btree (product_id, group_id, "position");


--
-- Name: product_reviews_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_created_at_id_idx ON public.product_reviews USING btree (created_at DESC, id DESC);


--
-- Name: product_variants_price_vnd_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_price_vnd_idx ON public.product_variants USING btree (price_vnd);


--
-- Name: product_variants_product_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_product_active_idx ON public.product_variants USING btree (product_id, active);


--
-- Name: product_variants_stock_quantity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_stock_quantity_idx ON public.product_variants USING btree (stock_quantity);


--
-- Name: products_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_category_id_idx ON public.products USING btree (category_id);


--
-- Name: products_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_name_lower_idx ON public.products USING btree (lower(name));


--
-- Name: products_stock_quantity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_stock_quantity_idx ON public.products USING btree (stock_quantity);


--
-- Name: refresh_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_token_hash_idx ON public.refresh_tokens USING btree (token_hash);


--
-- Name: return_request_items_order_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_request_items_order_item_id_idx ON public.return_request_items USING btree (order_item_id);


--
-- Name: return_request_items_request_order_item_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX return_request_items_request_order_item_unique_idx ON public.return_request_items USING btree (return_request_id, order_item_id);


--
-- Name: return_request_items_return_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_request_items_return_request_id_idx ON public.return_request_items USING btree (return_request_id);


--
-- Name: return_requests_one_open_per_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX return_requests_one_open_per_order_idx ON public.return_requests USING btree (order_id) WHERE (status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'received'::text]));


--
-- Name: return_requests_one_refunded_per_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX return_requests_one_refunded_per_order_idx ON public.return_requests USING btree (order_id) WHERE (status = 'refunded'::text);


--
-- Name: return_requests_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_requests_order_id_idx ON public.return_requests USING btree (order_id);


--
-- Name: return_requests_refunded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_requests_refunded_at_idx ON public.return_requests USING btree (refunded_at) WHERE (status = 'refunded'::text);


--
-- Name: return_requests_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_requests_status_created_at_idx ON public.return_requests USING btree (status, created_at);


--
-- Name: return_requests_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_requests_user_id_idx ON public.return_requests USING btree (user_id);


--
-- Name: users_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_created_at_id_idx ON public.users USING btree (created_at DESC, id DESC);


--
-- Name: variant_option_values_option_value_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX variant_option_values_option_value_id_idx ON public.variant_option_values USING btree (option_value_id);


--
-- Name: variant_option_values_product_group_value_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX variant_option_values_product_group_value_idx ON public.variant_option_values USING btree (product_id, group_id, option_value_id);


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;


--
-- Name: chat_attachments chat_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_attachments chat_attachments_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: chat_messages chat_messages_attached_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_attached_order_id_fkey FOREIGN KEY (attached_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: live_comments live_comments_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_comments
    ADD CONSTRAINT live_comments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;


--
-- Name: live_comments live_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_comments
    ADD CONSTRAINT live_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: live_session_products live_session_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_session_products
    ADD CONSTRAINT live_session_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: live_session_products live_session_products_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_session_products
    ADD CONSTRAINT live_session_products_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;


--
-- Name: live_sessions live_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_sessions
    ADD CONSTRAINT live_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: live_sessions live_sessions_pinned_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_sessions
    ADD CONSTRAINT live_sessions_pinned_product_id_fkey FOREIGN KEY (pinned_product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: live_variant_prices live_variant_prices_session_id_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_variant_prices
    ADD CONSTRAINT live_variant_prices_session_id_product_id_fkey FOREIGN KEY (session_id, product_id) REFERENCES public.live_session_products(session_id, product_id) ON DELETE CASCADE;


--
-- Name: live_variant_prices live_variant_prices_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_variant_prices
    ADD CONSTRAINT live_variant_prices_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_live_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_live_session_id_fkey FOREIGN KEY (live_session_id) REFERENCES public.live_sessions(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: post_comment_reactions post_comment_reactions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment_reactions
    ADD CONSTRAINT post_comment_reactions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: post_comment_reactions post_comment_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comment_reactions
    ADD CONSTRAINT post_comment_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: post_comments post_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_reply_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_reply_to_user_id_fkey FOREIGN KEY (reply_to_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: post_media post_media_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_media post_media_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: post_reactions post_reactions_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_reactions post_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: post_referred_products post_referred_products_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_referred_products
    ADD CONSTRAINT post_referred_products_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_referred_products post_referred_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_referred_products
    ADD CONSTRAINT post_referred_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: posts posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: product_favorites product_favorites_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_favorites
    ADD CONSTRAINT product_favorites_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_favorites product_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_favorites
    ADD CONSTRAINT product_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_option_groups product_option_groups_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_groups
    ADD CONSTRAINT product_option_groups_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_option_values product_option_values_product_id_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_values
    ADD CONSTRAINT product_option_values_product_id_group_id_fkey FOREIGN KEY (product_id, group_id) REFERENCES public.product_option_groups(product_id, id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE RESTRICT;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: return_request_items return_request_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_request_items
    ADD CONSTRAINT return_request_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE RESTRICT;


--
-- Name: return_request_items return_request_items_received_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_request_items
    ADD CONSTRAINT return_request_items_received_variant_id_fkey FOREIGN KEY (received_variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;


--
-- Name: return_request_items return_request_items_return_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_request_items
    ADD CONSTRAINT return_request_items_return_request_id_fkey FOREIGN KEY (return_request_id) REFERENCES public.return_requests(id) ON DELETE CASCADE;


--
-- Name: return_requests return_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: return_requests return_requests_refunded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_refunded_by_user_id_fkey FOREIGN KEY (refunded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: return_requests return_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: review_helpfulness_votes review_helpfulness_votes_reply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_reply_id_fkey FOREIGN KEY (reply_id) REFERENCES public.review_replies(id) ON DELETE CASCADE;


--
-- Name: review_helpfulness_votes review_helpfulness_votes_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.product_reviews(id) ON DELETE CASCADE;


--
-- Name: review_helpfulness_votes review_helpfulness_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: review_media review_media_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_media
    ADD CONSTRAINT review_media_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.product_reviews(id) ON DELETE CASCADE;


--
-- Name: review_replies review_replies_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.product_reviews(id) ON DELETE CASCADE;


--
-- Name: variant_option_values variant_option_values_product_id_group_id_option_value_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_option_values
    ADD CONSTRAINT variant_option_values_product_id_group_id_option_value_id_fkey FOREIGN KEY (product_id, group_id, option_value_id) REFERENCES public.product_option_values(product_id, group_id, id) ON DELETE RESTRICT;


--
-- Name: variant_option_values variant_option_values_product_id_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_option_values
    ADD CONSTRAINT variant_option_values_product_id_variant_id_fkey FOREIGN KEY (product_id, variant_id) REFERENCES public.product_variants(product_id, id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 8rrhbghcl0ZhLebwGh80NQVbcdyyNpDYhGqWVKpHdubcQqxU4zo5gENYdShFHqc

