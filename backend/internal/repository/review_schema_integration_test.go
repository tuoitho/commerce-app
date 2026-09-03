//go:build integration

package repository

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"commerce-backend/internal/repository/sqlc"
)

func TestReviewSchemaIntegration(t *testing.T) {
	ctx := context.Background()
	dbURL := integrationDatabaseURL()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect integration database %s: %v", dbURL, err)
	}
	defer conn.Close(ctx)

	// Ensure seed data / prerequisite entities exist
	seedReviewPrerequisites(t, ctx, conn)

	const (
		testUserID      = "11111111-2222-3333-4444-555555555551"
		testProduct     = "aaaaaaaa-1111-1111-1111-111111111111"
		testOrderID     = "99999999-1111-1111-1111-111111111111"
		testOrderItemA  = "99999999-1111-1111-1111-222222222221"
		testOrderItemB  = "99999999-1111-1111-1111-222222222222"
		testOrderItemC  = "99999999-1111-1111-1111-222222222223"
	)

	// Clean up reviews before test
	_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id IN ($1, $2, $3)", testOrderItemA, testOrderItemB, testOrderItemC)

	t.Run("OneReviewPerOrderItem_UniqueConstraint", func(t *testing.T) {
		// First review on item A should succeed
		var reviewIDA string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, 'Great item')
			RETURNING id
		`, testOrderItemA).Scan(&reviewIDA)
		if err != nil {
			t.Fatalf("insert first review failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", reviewIDA)
		}()

		// Second review on same item A must fail unique constraint
		_, err = conn.Exec(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 4, 'Duplicate review')
		`, testOrderItemA)
		if err == nil {
			t.Fatal("expected error on duplicate review for same order_item_id, got nil")
		}
		if !strings.Contains(err.Error(), "unique") && !strings.Contains(err.Error(), "duplicate key") {
			t.Fatalf("expected unique constraint violation, got %v", err)
		}
	})

	t.Run("Rating_RangeConstraint", func(t *testing.T) {
		// Valid ratings: 1 to 5
		for r := 1; r <= 5; r++ {
			var id string
			err := conn.QueryRow(ctx, `
				INSERT INTO product_reviews (order_item_id, rating, comment)
				VALUES ($1, $2, 'Valid rating')
				RETURNING id
			`, testOrderItemB, r).Scan(&id)
			if err != nil {
				t.Fatalf("rating %d failed: %v", r, err)
			}
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", id)
		}

		// Invalid rating: 0
		_, err := conn.Exec(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 0, 'Invalid rating')
		`, testOrderItemB)
		if err == nil {
			t.Fatal("expected error for rating=0, got nil")
		}

		// Invalid rating: 6
		_, err = conn.Exec(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 6, 'Invalid rating')
		`, testOrderItemB)
		if err == nil {
			t.Fatal("expected error for rating=6, got nil")
		}
	})

	t.Run("Comment_LengthConstraint", func(t *testing.T) {
		// Exactly 1000 characters comment should succeed
		comment1000 := strings.Repeat("a", 1000)
		var id string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, $2)
			RETURNING id
		`, testOrderItemB, comment1000).Scan(&id)
		if err != nil {
			t.Fatalf("1000 char comment failed: %v", err)
		}
		_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", id)

		// 1001 characters comment must fail
		comment1001 := strings.Repeat("a", 1001)
		_, err = conn.Exec(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, $2)
		`, testOrderItemB, comment1001)
		if err == nil {
			t.Fatal("expected error for 1001 char comment, got nil")
		}
	})

	t.Run("EditCount_RangeConstraint", func(t *testing.T) {
		// Valid edit_count: 0
		var id string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment, edit_count)
			VALUES ($1, 5, 'Default edit count', 0)
			RETURNING id
		`, testOrderItemB).Scan(&id)
		if err != nil {
			t.Fatalf("edit_count=0 failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", id)
		}()

		// Update to edit_count = 1 should succeed
		_, err = conn.Exec(ctx, `
			UPDATE product_reviews SET edit_count = 1 WHERE id = $1
		`, id)
		if err != nil {
			t.Fatalf("update to edit_count=1 failed: %v", err)
		}

		// Update to edit_count = 2 must fail CHECK constraint
		_, err = conn.Exec(ctx, `
			UPDATE product_reviews SET edit_count = 2 WHERE id = $1
		`, id)
		if err == nil {
			t.Fatal("expected error for edit_count=2, got nil")
		}

		// Update to edit_count = -1 must fail CHECK constraint
		_, err = conn.Exec(ctx, `
			UPDATE product_reviews SET edit_count = -1 WHERE id = $1
		`, id)
		if err == nil {
			t.Fatal("expected error for edit_count=-1, got nil")
		}
	})

	t.Run("ReviewMedia_Constraints", func(t *testing.T) {
		var reviewID string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, 'Review with media')
			RETURNING id
		`, testOrderItemC).Scan(&reviewID)
		if err != nil {
			t.Fatalf("create parent review failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", reviewID)
		}()

		// Valid image types
		validImages := []struct {
			mime string
			size int64
		}{
			{"image/jpeg", 5000000},
			{"image/png", 1024},
			{"image/webp", 2048},
		}
		for i, img := range validImages {
			_, err := conn.Exec(ctx, `
				INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
				VALUES ($1, 'image', $2, $3, $4, $5)
			`, reviewID, img.mime, "key-img-"+string(rune('a'+i)), img.size, int16(i))
			if err != nil {
				t.Fatalf("insert valid image %s failed: %v", img.mime, err)
			}
		}

		// Image > 5MB must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'image', 'image/jpeg', 'key-img-too-large', 5000001, 10)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for image > 5MB, got nil")
		}

		// Invalid image mime type (e.g. image/gif) must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'image', 'image/gif', 'key-img-gif', 1000, 10)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for image/gif MIME type, got nil")
		}

		// Valid video types
		validVideos := []struct {
			mime string
			size int64
		}{
			{"video/mp4", 50000000},
			{"video/webm", 1024},
		}
		for i, vid := range validVideos {
			_, err := conn.Exec(ctx, `
				INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
				VALUES ($1, 'video', $2, $3, $4, $5)
			`, reviewID, vid.mime, "key-vid-"+string(rune('a'+i)), vid.size, int16(i))
			if err != nil {
				t.Fatalf("insert valid video %s failed: %v", vid.mime, err)
			}
		}

		// Video > 50MB must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'video', 'video/mp4', 'key-vid-too-large', 50000001, 10)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for video > 50MB, got nil")
		}

		// Invalid video MIME type
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'video', 'video/avi', 'key-vid-avi', 1000, 10)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for video/avi MIME type, got nil")
		}

		// size_bytes <= 0 must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'image', 'image/jpeg', 'key-img-zero', 0, 10)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for size_bytes=0, got nil")
		}

		// position < 0 must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'image', 'image/jpeg', 'key-img-neg-pos', 1000, -1)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for position=-1, got nil")
		}

		// Duplicate (review_id, media_type, position) must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'image', 'image/jpeg', 'key-img-dup-pos', 1000, 0)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for duplicate (review_id, media_type, position), got nil")
		}

		// Duplicate object_key must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'image', 'image/jpeg', 'key-img-a', 1000, 9)
		`, reviewID)
		if err == nil {
			t.Fatal("expected error for duplicate object_key, got nil")
		}
	})

	t.Run("CascadeDelete_ReviewMedia", func(t *testing.T) {
		var reviewID string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 4, 'To be deleted')
			RETURNING id
		`, testOrderItemC).Scan(&reviewID)
		if err != nil {
			t.Fatalf("insert review failed: %v", err)
		}

		_, err = conn.Exec(ctx, `
			INSERT INTO review_media (review_id, media_type, mime_type, object_key, size_bytes, position)
			VALUES ($1, 'image', 'image/jpeg', 'cascade-test-key', 100, 0)
		`, reviewID)
		if err != nil {
			t.Fatalf("insert media failed: %v", err)
		}

		// Delete review -> media should be deleted via CASCADE
		_, err = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", reviewID)
		if err != nil {
			t.Fatalf("delete review failed: %v", err)
		}

		var count int
		err = conn.QueryRow(ctx, "SELECT COUNT(*) FROM review_media WHERE review_id = $1", reviewID).Scan(&count)
		if err != nil {
			t.Fatalf("count media failed: %v", err)
		}
		if count != 0 {
			t.Fatalf("expected 0 media rows after review deletion, got %d", count)
		}
	})

	t.Run("RestrictDelete_OrderItemWithReview", func(t *testing.T) {
		var reviewID string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, 'Restrict test')
			RETURNING id
		`, testOrderItemC).Scan(&reviewID)
		if err != nil {
			t.Fatalf("insert review failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", reviewID)
		}()

		// Attempting to delete order_item should be blocked by ON DELETE RESTRICT
		_, err = conn.Exec(ctx, "DELETE FROM order_items WHERE id = $1", testOrderItemC)
		if err == nil {
			t.Fatal("expected error on deleting order_item with existing review, got nil")
		}
		if !strings.Contains(err.Error(), "foreign key") && !strings.Contains(err.Error(), "violates foreign key") {
			t.Fatalf("expected foreign key violation error, got %v", err)
		}
	})

	t.Run("GetReviewSummaryByProductID_EmptyAndNonEmpty", func(t *testing.T) {
		queries := sqlc.New(conn)
		// 1. Product with 0 reviews
		summary, err := queries.GetReviewSummaryByProductID(ctx, testProduct)
		if err != nil {
			t.Fatalf("get review summary for 0 reviews failed: %v", err)
		}
		if summary.TotalReviews != 0 {
			t.Fatalf("expected total_reviews=0, got %d", summary.TotalReviews)
		}
		if summary.AverageRating != "0.0" {
			t.Fatalf("expected average_rating='0.0', got %q", summary.AverageRating)
		}

		// 2. Product with reviews
		var r1, r2 string
		err = conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, 'Review 1')
			RETURNING id
		`, testOrderItemA).Scan(&r1)
		if err != nil {
			t.Fatalf("insert r1 failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id IN ($1, $2)", r1, r2)
		}()

		err = conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 4, 'Review 2')
			RETURNING id
		`, testOrderItemB).Scan(&r2)
		if err != nil {
			t.Fatalf("insert r2 failed: %v", err)
		}

		summary, err = queries.GetReviewSummaryByProductID(ctx, testProduct)
		if err != nil {
			t.Fatalf("get review summary for 2 reviews failed: %v", err)
		}
		if summary.TotalReviews != 2 {
			t.Fatalf("expected total_reviews=2, got %d", summary.TotalReviews)
		}
		if summary.AverageRating != "4.5" {
			t.Fatalf("expected average_rating='4.5', got %q", summary.AverageRating)
		}
	})

	t.Run("MigrationUpDown_CleanExecution", func(t *testing.T) {
		root, err := filepath.Abs(filepath.Join("..", ".."))
		if err != nil {
			t.Fatal(err)
		}

		down15, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000015_create_review_replies_and_votes.down.sql"))
		if err != nil {
			t.Fatalf("read down migration 15: %v", err)
		}
		down14, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000014_add_admin_reply_to_reviews.down.sql"))
		if err != nil {
			t.Fatalf("read down migration 14: %v", err)
		}
		down13, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000013_create_product_reviews.down.sql"))
		if err != nil {
			t.Fatalf("read down migration 13: %v", err)
		}

		// Down in reverse order
		if _, err := conn.Exec(ctx, string(down15)); err != nil {
			t.Fatalf("execute down migration 15: %v", err)
		}
		if _, err := conn.Exec(ctx, string(down14)); err != nil {
			t.Fatalf("execute down migration 14: %v", err)
		}
		if _, err := conn.Exec(ctx, string(down13)); err != nil {
			t.Fatalf("execute down migration 13: %v", err)
		}

		// Confirm tables do not exist
		var exists bool
		_ = conn.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_reviews')
		`).Scan(&exists)
		if exists {
			t.Fatal("expected product_reviews table to be dropped")
		}
		_ = conn.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_media')
		`).Scan(&exists)
		if exists {
			t.Fatal("expected review_media table to be dropped")
		}

		// Re-apply up migrations in order
		up13, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000013_create_product_reviews.up.sql"))
		if err != nil {
			t.Fatalf("read up migration 13: %v", err)
		}
		up14, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000014_add_admin_reply_to_reviews.up.sql"))
		if err != nil {
			t.Fatalf("read up migration 14: %v", err)
		}
		up15, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000015_create_review_replies_and_votes.up.sql"))
		if err != nil {
			t.Fatalf("read up migration 15: %v", err)
		}

		if _, err := conn.Exec(ctx, string(up13)); err != nil {
			t.Fatalf("re-apply up migration 13: %v", err)
		}
		if _, err := conn.Exec(ctx, string(up14)); err != nil {
			t.Fatalf("re-apply up migration 14: %v", err)
		}
		if _, err := conn.Exec(ctx, string(up15)); err != nil {
			t.Fatalf("re-apply up migration 15: %v", err)
		}

		// Confirm tables exist again
		_ = conn.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_reviews')
		`).Scan(&exists)
		if !exists {
			t.Fatal("expected product_reviews table to exist after up migration")
		}
		_ = conn.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_media')
		`).Scan(&exists)
		if !exists {
			t.Fatal("expected review_media table to exist after up migration")
		}
	})
}

func TestReviewRepliesAndVotesSchemaIntegration(t *testing.T) {
	ctx := context.Background()
	dbURL := integrationDatabaseURL()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect integration database %s: %v", dbURL, err)
	}
	defer conn.Close(ctx)

	seedReviewPrerequisites(t, ctx, conn)

	const (
		testUserID     = "11111111-2222-3333-4444-555555555551"
		testOrderItemA = "99999999-1111-1111-1111-222222222221"
	)

	// Clean up reviews before test
	_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id = $1", testOrderItemA)

	t.Run("ReviewReplies_TableAndConstraints", func(t *testing.T) {
		var reviewID string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, 'Review for reply test')
			RETURNING id
		`, testOrderItemA).Scan(&reviewID)
		if err != nil {
			t.Fatalf("insert review failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", reviewID)
		}()

		// 1. Insert valid reply
		var replyID string
		err = conn.QueryRow(ctx, `
			INSERT INTO review_replies (review_id, content)
			VALUES ($1, 'Cảm ơn bạn đã phản hồi!')
			RETURNING id
		`, reviewID).Scan(&replyID)
		if err != nil {
			t.Fatalf("insert reply failed: %v", err)
		}

		// 2. Unique review_id constraint: cannot insert 2nd reply for same review
		_, err = conn.Exec(ctx, `
			INSERT INTO review_replies (review_id, content)
			VALUES ($1, 'Second reply attempt')
		`, reviewID)
		if err == nil {
			t.Fatal("expected error on duplicate reply for same review_id, got nil")
		}

		// 3. Content length constraints: empty content (0 chars) must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_replies (review_id, content)
			VALUES (gen_random_uuid(), '')
		`)
		if err == nil {
			t.Fatal("expected error for empty reply content, got nil")
		}

		// Content length > 1000 chars must fail
		tooLongReply := strings.Repeat("x", 1001)
		_, err = conn.Exec(ctx, `
			INSERT INTO review_replies (review_id, content)
			VALUES (gen_random_uuid(), $1)
		`, tooLongReply)
		if err == nil {
			t.Fatal("expected error for reply content > 1000 chars, got nil")
		}
	})

	t.Run("ReviewHelpfulnessVotes_ConstraintsAndCascade", func(t *testing.T) {
		var reviewID string
		err := conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment)
			VALUES ($1, 5, 'Review for vote test')
			RETURNING id
		`, testOrderItemA).Scan(&reviewID)
		if err != nil {
			t.Fatalf("insert review failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", reviewID)
		}()

		var replyID string
		err = conn.QueryRow(ctx, `
			INSERT INTO review_replies (review_id, content)
			VALUES ($1, 'Reply for vote test')
			RETURNING id
		`, reviewID).Scan(&replyID)
		if err != nil {
			t.Fatalf("insert reply failed: %v", err)
		}

		// 1. Valid vote for review
		var reviewVoteID string
		err = conn.QueryRow(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, $2, NULL, 'helpful')
			RETURNING id
		`, testUserID, reviewID).Scan(&reviewVoteID)
		if err != nil {
			t.Fatalf("insert review vote failed: %v", err)
		}

		// 2. Target check: both review_id and reply_id non-null must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, $2, $3, 'helpful')
		`, testUserID, reviewID, replyID)
		if err == nil {
			t.Fatal("expected error for both review_id and reply_id non-null, got nil")
		}

		// Target check: both review_id and reply_id null must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, NULL, NULL, 'helpful')
		`, testUserID)
		if err == nil {
			t.Fatal("expected error for both review_id and reply_id null, got nil")
		}

		// 3. Vote value check: invalid vote string must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, NULL, $2, 'awesome')
		`, testUserID, replyID)
		if err == nil {
			t.Fatal("expected error for invalid vote value 'awesome', got nil")
		}

		// 4. Unique (user_id, review_id) constraint: duplicate vote on same review must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, $2, NULL, 'unhelpful')
		`, testUserID, reviewID)
		if err == nil {
			t.Fatal("expected unique violation on duplicate (user_id, review_id), got nil")
		}

		// 5. Valid vote for reply
		var replyVoteID string
		err = conn.QueryRow(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, NULL, $2, 'unhelpful')
			RETURNING id
		`, testUserID, replyID).Scan(&replyVoteID)
		if err != nil {
			t.Fatalf("insert reply vote failed: %v", err)
		}

		// 6. Unique (user_id, reply_id) constraint: duplicate vote on same reply must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, NULL, $2, 'helpful')
		`, testUserID, replyID)
		if err == nil {
			t.Fatal("expected unique violation on duplicate (user_id, reply_id), got nil")
		}

		// 7. Cascade delete: deleting reply cascades to reply vote
		_, err = conn.Exec(ctx, "DELETE FROM review_replies WHERE id = $1", replyID)
		if err != nil {
			t.Fatalf("delete reply failed: %v", err)
		}
		var replyVoteCount int
		_ = conn.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE id = $1", replyVoteID).Scan(&replyVoteCount)
		if replyVoteCount != 0 {
			t.Fatalf("expected reply vote to be cascaded and deleted, got count %d", replyVoteCount)
		}

		// Review vote should still exist
		var reviewVoteCount int
		_ = conn.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE id = $1", reviewVoteID).Scan(&reviewVoteCount)
		if reviewVoteCount != 1 {
			t.Fatalf("expected review vote to still exist, got count %d", reviewVoteCount)
		}
	})

	t.Run("Migration000015_UpDownAndBackfill", func(t *testing.T) {
		root, err := filepath.Abs(filepath.Join("..", ".."))
		if err != nil {
			t.Fatal(err)
		}

		downSQL, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000015_create_review_replies_and_votes.down.sql"))
		if err != nil {
			t.Fatalf("read migration 15 down: %v", err)
		}

		upSQL, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000015_create_review_replies_and_votes.up.sql"))
		if err != nil {
			t.Fatalf("read migration 15 up: %v", err)
		}

		// First, execute down migration 15 to restore product_reviews.admin_reply schema
		if _, err := conn.Exec(ctx, string(downSQL)); err != nil {
			t.Fatalf("execute migration 15 down: %v", err)
		}

		// Insert review with admin_reply in schema 14
		var reviewID string
		testReplyText := "Phản hồi mẫu trước migration"
		err = conn.QueryRow(ctx, `
			INSERT INTO product_reviews (order_item_id, rating, comment, admin_reply, admin_replied_at)
			VALUES ($1, 5, 'Comment test backfill', $2, now())
			RETURNING id
		`, testOrderItemA, testReplyText).Scan(&reviewID)
		if err != nil {
			t.Fatalf("insert review with admin_reply in schema 14: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", reviewID)
		}()

		// Execute up migration 15: should backfill into review_replies and drop admin_reply from product_reviews
		if _, err := conn.Exec(ctx, string(upSQL)); err != nil {
			t.Fatalf("execute migration 15 up: %v", err)
		}

		// Verify review_replies has the backfilled reply
		var backfilledContent string
		err = conn.QueryRow(ctx, `
			SELECT content FROM review_replies WHERE review_id = $1
		`, reviewID).Scan(&backfilledContent)
		if err != nil {
			t.Fatalf("query backfilled reply: %v", err)
		}
		if backfilledContent != testReplyText {
			t.Fatalf("expected backfilled content %q, got %q", testReplyText, backfilledContent)
		}

		// Verify product_reviews no longer has admin_reply column
		var colExists bool
		_ = conn.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns 
				WHERE table_name = 'product_reviews' AND column_name = 'admin_reply'
			)
		`).Scan(&colExists)
		if colExists {
			t.Fatal("expected admin_reply column to be dropped from product_reviews")
		}

		// Execute down migration 15: should restore admin_reply column and copy data back
		if _, err := conn.Exec(ctx, string(downSQL)); err != nil {
			t.Fatalf("execute migration 15 down after backfill: %v", err)
		}

		var restoredReply string
		err = conn.QueryRow(ctx, `
			SELECT admin_reply FROM product_reviews WHERE id = $1
		`, reviewID).Scan(&restoredReply)
		if err != nil {
			t.Fatalf("query restored admin_reply: %v", err)
		}
		if restoredReply != testReplyText {
			t.Fatalf("expected restored reply %q, got %q", testReplyText, restoredReply)
		}

		// Re-apply up migration 15 for subsequent tests
		if _, err := conn.Exec(ctx, string(upSQL)); err != nil {
			t.Fatalf("re-apply migration 15 up: %v", err)
		}
	})
}

func seedReviewPrerequisites(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	const (
		testUserID      = "11111111-2222-3333-4444-555555555551"
		otherUserID     = "11111111-2222-3333-4444-555555555552"
		testCategory    = "10000000-0000-0000-0000-000000000001"
		testProduct     = "aaaaaaaa-1111-1111-1111-111111111111"
		testVariant     = "aaaaaaaa-1111-1111-1111-111111111112"
		testOrderID     = "99999999-1111-1111-1111-111111111111"
		testOrderItemA  = "99999999-1111-1111-1111-222222222221"
		testOrderItemB  = "99999999-1111-1111-1111-222222222222"
		testOrderItemC  = "99999999-1111-1111-1111-222222222223"
	)

	// Users
	_, _ = conn.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role)
		VALUES ($1, 'reviewer@example.com', 'hash', 'customer'),
		       ($2, 'other@example.com', 'hash', 'customer')
		ON CONFLICT (id) DO NOTHING
	`, testUserID, otherUserID)

	// Category
	_, _ = conn.Exec(ctx, `
		INSERT INTO categories (id, name)
		VALUES ($1, 'Review Test Category')
		ON CONFLICT (id) DO NOTHING
	`, testCategory)

	// Product
	_, _ = conn.Exec(ctx, `
		INSERT INTO products (id, category_id, name, model, brand, description, price, currency, stock_quantity, featured, active)
		VALUES ($1, $2, 'Reviewed Phone', 'RP-1', 'TestBrand', 'Description', 10000000, 'VND', 10, true, true)
		ON CONFLICT (id) DO NOTHING
	`, testProduct, testCategory)

	// Variant
	_, _ = conn.Exec(ctx, `
		INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active)
		VALUES ($1, $2, 10000000, 10, true)
		ON CONFLICT (id) DO NOTHING
	`, testVariant, testProduct)

	// Order
	_, _ = conn.Exec(ctx, `
		INSERT INTO orders (id, user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
		VALUES ($1, $2, 'delivered', 'cod', 30000000, 0, 30000000, 'Test User', '0901234567', 'Hanoi', 'Dich Vong', '123 Test St')
		ON CONFLICT (id) DO NOTHING
	`, testOrderID, testUserID)

	// Order Items
	for _, itemID := range []string{testOrderItemA, testOrderItemB, testOrderItemC} {
		_, _ = conn.Exec(ctx, `
			INSERT INTO order_items (id, order_id, variant_id, product_id, brand_name, product_name, model, image_url, options, unit_price_vnd, quantity, line_total_vnd)
			VALUES ($1, $2, $3, $4, 'TestBrand', 'Reviewed Phone', 'RP-1', 'https://example.com/img.jpg', '[]'::jsonb, 10000000, 1, 10000000)
			ON CONFLICT (id) DO NOTHING
		`, itemID, testOrderID, testVariant, testProduct)
	}
}
