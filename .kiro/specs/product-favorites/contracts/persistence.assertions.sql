DO $$
BEGIN
    IF to_regclass('public.product_favorites') IS NULL THEN
        RAISE EXCEPTION 'product_favorites table is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_favorites'
          AND column_name = 'user_id'
          AND data_type = 'uuid'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'product_favorites.user_id must be a non-null uuid';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_favorites'
          AND column_name = 'product_id'
          AND data_type = 'uuid'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'product_favorites.product_id must be a non-null uuid';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_favorites'
          AND column_name = 'created_at'
          AND data_type = 'timestamp with time zone'
          AND is_nullable = 'NO'
          AND column_default = 'now()'
    ) THEN
        RAISE EXCEPTION 'product_favorites.created_at must be a non-null timestamptz defaulting to now()';
    END IF;

    IF (
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_favorites'
    ) <> 3 THEN
        RAISE EXCEPTION 'product_favorites must contain only user_id, product_id, and created_at';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.product_favorites'::regclass
          AND contype = 'p'
          AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, product_id)'
    ) THEN
        RAISE EXCEPTION 'product_favorites primary key must be (user_id, product_id)';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.product_favorites'::regclass
          AND contype = 'f'
          AND confrelid = 'public.users'::regclass
          AND confdeltype = 'c'
          AND pg_get_constraintdef(oid) = 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
    ) THEN
        RAISE EXCEPTION 'product_favorites.user_id must cascade on user deletion';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.product_favorites'::regclass
          AND contype = 'f'
          AND confrelid = 'public.products'::regclass
          AND confdeltype = 'c'
          AND pg_get_constraintdef(oid) = 'FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE'
    ) THEN
        RAISE EXCEPTION 'product_favorites.product_id must cascade on product deletion';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'product_favorites'
          AND indexdef ILIKE '%(user_id, created_at DESC, product_id)%'
    ) THEN
        RAISE EXCEPTION 'newest-first customer pagination index is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'product_favorites'
          AND indexdef ILIKE '%(product_id)%'
    ) THEN
        RAISE EXCEPTION 'product-leading favorite index is missing';
    END IF;
END
$$;
