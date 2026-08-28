//go:build integration

package repository

import (
	"context"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

func TestReviewRepositoryIntegration(t *testing.T) {
	ctx := context.Background()
	dbURL := integrationDatabaseURL()

	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect integration db %s: %v", dbURL, err)
	}
	defer conn.Close(ctx)

	// Seed prerequisites
	seedReviewPrerequisites(t, ctx, conn)

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect pool: %v", err)
	}
	defer pool.Close()

	const (
		testUserID     = "11111111-2222-3333-4444-555555555551"
		otherUserID    = "11111111-2222-3333-4444-555555555552"
		testProduct    = "aaaaaaaa-1111-1111-1111-111111111111"
		testOrderID    = "99999999-1111-1111-1111-111111111111"
		testOrderItemA = "99999999-1111-1111-1111-222222222221"
		testOrderItemB = "99999999-1111-1111-1111-222222222222"
		testOrderItemC = "99999999-1111-1111-1111-222222222223"
	)

	// Clean up existing reviews on test items
	_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id IN ($1, $2, $3)", testOrderItemA, testOrderItemB, testOrderItemC)

	repo := NewReviewRepository(pool)

	t.Run("CreateReview_Success", func(t *testing.T) {
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Rất hài lòng về sản phẩm",
			Media: []domain.CreateReviewMediaInput{
				{
					MediaType: domain.ReviewMediaTypeImage,
					MimeType:  "image/jpeg",
					ObjectKey: "reviews/test/img1.jpg",
					SizeBytes: 1024,
					Position:  0,
				},
			},
		})
		require.NoError(t, err)
		require.NotNil(t, rev)
		assert.Equal(t, int16(5), rev.Rating)
		assert.Equal(t, "Rất hài lòng về sản phẩm", rev.Comment)
		assert.True(t, rev.CanEdit)
		assert.False(t, rev.Edited)
		require.Len(t, rev.Media, 1)
		assert.Equal(t, "/media/reviews/"+rev.Media[0].ID, rev.Media[0].URL)

		// Read back by ID
		readRev, err := repo.GetReviewByID(ctx, rev.ID)
		require.NoError(t, err)
		assert.Equal(t, rev.ID, readRev.ID)
		assert.Equal(t, rev.Rating, readRev.Rating)

		// Read back by OrderItemID
		readByItem, err := repo.GetReviewByOrderItemID(ctx, testOrderItemA)
		require.NoError(t, err)
		assert.Equal(t, rev.ID, readByItem.ID)

		// List by order item IDs
		itemMap, err := repo.ListReviewsByOrderItemIDs(ctx, []string{testOrderItemA, testOrderItemB})
		require.NoError(t, err)
		assert.Contains(t, itemMap, testOrderItemA)
		assert.NotContains(t, itemMap, testOrderItemB)

		// Clean up
		_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
	})

	t.Run("CreateReview_NonOwner_Fails", func(t *testing.T) {
		_, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      otherUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Invalid owner",
		})
		require.Error(t, err)
		assert.Equal(t, domain.ErrOrderItemNotFound, err)
	})

	t.Run("CreateReview_DuplicateConcurrent_OnlyOneSucceeds", func(t *testing.T) {
		var wg sync.WaitGroup
		errs := make([]error, 2)
		reviews := make([]*domain.Review, 2)

		for i := 0; i < 2; i++ {
			idx := i
			wg.Add(1)
			go func() {
				defer wg.Done()
				r, err := repo.CreateReview(ctx, domain.CreateReviewInput{
					UserID:      testUserID,
					OrderID:     testOrderID,
					OrderItemID: testOrderItemB,
					Rating:      int16(4 + idx),
					Comment:     "Concurrent review test",
				})
				reviews[idx] = r
				errs[idx] = err
			}()
		}
		wg.Wait()

		var successCount int
		var conflictCount int
		for i := 0; i < 2; i++ {
			if errs[i] == nil && reviews[i] != nil {
				successCount++
			} else if errs[i] == domain.ErrReviewAlreadyExists {
				conflictCount++
			}
		}

		assert.Equal(t, 1, successCount, "Exactly one review create must succeed")
		assert.Equal(t, 1, conflictCount, "Second review create must receive ErrReviewAlreadyExists")

		// Clean up
		_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id = $1", testOrderItemB)
	})

	t.Run("CreateReview_RefundedItem_Rejected", func(t *testing.T) {
		// Create a refunded return request containing testOrderItemC
		var returnReqID string
		err := pool.QueryRow(ctx, `
			INSERT INTO return_requests (order_id, user_id, status, reason_code, description, expected_refund_amount_vnd, refund_amount_vnd, refunded_by_user_id, refunded_at)
			VALUES ($1, $2, 'refunded', 'defective', 'Damaged item', 100000, 100000, $2, now())
			RETURNING id
		`, testOrderID, testUserID).Scan(&returnReqID)
		require.NoError(t, err)

		_, err = pool.Exec(ctx, `
			INSERT INTO return_request_items (return_request_id, order_item_id, quantity)
			VALUES ($1, $2, 1)
		`, returnReqID, testOrderItemC)
		require.NoError(t, err)

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM return_requests WHERE id = $1", returnReqID)
		}()

		// Try creating review on refunded item
		_, err = repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemC,
			Rating:      5,
			Comment:     "Refunded review attempt",
		})
		require.Error(t, err)
		assert.Equal(t, domain.ErrReviewNotEligible, err)
	})

	t.Run("UpdateReview_SingleEditEnforcementAndConcurrency", func(t *testing.T) {
		// 1. Create initial review
		initialRev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      3,
			Comment:     "Initial comment",
			Media: []domain.CreateReviewMediaInput{
				{
					MediaType: domain.ReviewMediaTypeImage,
					MimeType:  "image/jpeg",
					ObjectKey: "reviews/initial/img.jpg",
					SizeBytes: 200,
					Position:  0,
				},
			},
		})
		require.NoError(t, err)
		require.NotNil(t, initialRev)
		assert.True(t, initialRev.CanEdit)
		assert.False(t, initialRev.Edited)

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", initialRev.ID)
		}()

		// 2. Concurrent update on same review
		var wg sync.WaitGroup
		errs := make([]error, 2)
		updatedRevs := make([]*domain.Review, 2)

		for i := 0; i < 2; i++ {
			idx := i
			wg.Add(1)
			go func() {
				defer wg.Done()
				r, _, err := repo.UpdateReview(ctx, domain.UpdateReviewInput{
					UserID:           testUserID,
					OrderID:          testOrderID,
					OrderItemID:      testOrderItemA,
					ReviewID:         initialRev.ID,
					Rating:           int16(4 + idx),
					Comment:          "Updated concurrent comment",
					RetainedMediaIDs: []string{initialRev.Media[0].ID},
				})
				updatedRevs[idx] = r
				errs[idx] = err
			}()
		}
		wg.Wait()

		var successCount int
		var limitCount int
		for i := 0; i < 2; i++ {
			if errs[i] == nil && updatedRevs[i] != nil {
				successCount++
				assert.True(t, updatedRevs[i].Edited)
				assert.False(t, updatedRevs[i].CanEdit)
			} else if errs[i] == domain.ErrReviewEditLimitReached {
				limitCount++
			}
		}

		assert.Equal(t, 1, successCount, "Exactly one update must succeed")
		assert.Equal(t, 1, limitCount, "Subsequent update must receive ErrReviewEditLimitReached")

		// 3. Subsequent update must fail with ErrReviewEditLimitReached
		_, _, err = repo.UpdateReview(ctx, domain.UpdateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			ReviewID:    initialRev.ID,
			Rating:      5,
			Comment:     "Another edit attempt",
		})
		require.Error(t, err)
		assert.Equal(t, domain.ErrReviewEditLimitReached, err)
	})

	t.Run("UpdateReview_AfterItemRefunded_StillAllowedOnce", func(t *testing.T) {
		// Create review on item C before refund
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemC,
			Rating:      4,
			Comment:     "Before refund comment",
		})
		require.NoError(t, err)
		require.NotNil(t, rev)

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
		}()

		// Refund item C
		var returnReqID string
		err = pool.QueryRow(ctx, `
			INSERT INTO return_requests (order_id, user_id, status, reason_code, description, expected_refund_amount_vnd, refund_amount_vnd, refunded_by_user_id, refunded_at)
			VALUES ($1, $2, 'refunded', 'defective', 'Refund after review', 50000, 50000, $2, now())
			RETURNING id
		`, testOrderID, testUserID).Scan(&returnReqID)
		require.NoError(t, err)

		_, err = pool.Exec(ctx, `
			INSERT INTO return_request_items (return_request_id, order_item_id, quantity)
			VALUES ($1, $2, 1)
		`, returnReqID, testOrderItemC)
		require.NoError(t, err)

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM return_requests WHERE id = $1", returnReqID)
		}()

		// Edit review after refund should SUCCEED for the single allowed edit (Requirement 3.8)
		updatedRev, _, err := repo.UpdateReview(ctx, domain.UpdateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemC,
			ReviewID:    rev.ID,
			Rating:      5,
			Comment:     "Edited comment after refund",
		})
		require.NoError(t, err)
		require.NotNil(t, updatedRev)
		assert.True(t, updatedRev.Edited)
		assert.False(t, updatedRev.CanEdit)
		assert.Equal(t, "Edited comment after refund", updatedRev.Comment)
	})

	t.Run("GetPublicReviews_AggregateAndPagination", func(t *testing.T) {
		// Clean up reviews on test items
		_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id IN ($1, $2, $3)", testOrderItemA, testOrderItemB, testOrderItemC)

		// 1. Initial 0 reviews
		res0, err := repo.GetPublicReviewsByProductID(ctx, testProduct, 1, 10)
		require.NoError(t, err)
		require.NotNil(t, res0)
		assert.Equal(t, int64(0), res0.Summary.TotalReviews)
		assert.Equal(t, "0.0", res0.Summary.AverageRating)
		assert.Equal(t, int64(0), res0.Summary.RatingCounts["1"])
		assert.Equal(t, int64(0), res0.Summary.RatingCounts["5"])
		assert.Empty(t, res0.Reviews)

		// 2. Create 2 reviews on testProduct
		revA, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Review item A 5 stars",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revA.ID)
		}()

		revB, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemB,
			Rating:      4,
			Comment:     "Review item B 4 stars",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revB.ID)
		}()

		// 3. Query public reviews
		res, err := repo.GetPublicReviewsByProductID(ctx, testProduct, 1, 10)
		require.NoError(t, err)
		require.NotNil(t, res)
		assert.Equal(t, int64(2), res.Summary.TotalReviews)
		assert.Equal(t, "4.5", res.Summary.AverageRating)
		assert.Equal(t, int64(1), res.Summary.RatingCounts["4"])
		assert.Equal(t, int64(1), res.Summary.RatingCounts["5"])
		assert.Equal(t, int64(0), res.Summary.RatingCounts["1"])
		require.Len(t, res.Reviews, 2)

		// Verify deterministic order: created_at DESC, id DESC
		assert.Equal(t, revB.ID, res.Reviews[0].ID)
		assert.Equal(t, revA.ID, res.Reviews[1].ID)

		// Verify reviewer email masking and purchase options
		assert.NotNil(t, res.Reviews[0].Reviewer.MaskedEmail)
		assert.NotEmpty(t, res.Reviews[0].Purchase.Model)
	})

	t.Run("OrderRepository_ReviewableBucket_And_AwaitingReviewStats", func(t *testing.T) {
		orderRepo := NewOrderRepository(pool)

		// 1. Clean up any reviews and return requests on test items
		_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id IN ($1, $2, $3)", testOrderItemA, testOrderItemB, testOrderItemC)
		_, _ = pool.Exec(ctx, "DELETE FROM return_requests WHERE order_id = $1", testOrderID)

		// 2. Order is delivered and has 3 unreviewed, unrefunded items -> AwaitingReview must be at least 1, reviewable list must include testOrderID
		statsBefore, err := orderRepo.StatsByUser(ctx, testUserID)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, statsBefore.AwaitingReview, 1)

		reviewableOrders, err := orderRepo.ListByUser(ctx, testUserID, domain.OrderStatusBucketReviewable)
		require.NoError(t, err)
		found := false
		for _, o := range reviewableOrders {
			if o.ID == testOrderID {
				found = true
				break
			}
		}
		assert.True(t, found, "testOrderID should be in reviewable bucket")

		// 3. Create reviews for all 3 items
		revA, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Review A",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revA.ID)
		}()

		revB, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemB,
			Rating:      4,
			Comment:     "Review B",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revB.ID)
		}()

		revC, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemC,
			Rating:      5,
			Comment:     "Review C",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revC.ID)
		}()

		// 4. Now all items of testOrderID are reviewed -> testOrderID must NOT be in reviewable bucket
		statsAfter, err := orderRepo.StatsByUser(ctx, testUserID)
		require.NoError(t, err)
		assert.Equal(t, statsBefore.AwaitingReview-1, statsAfter.AwaitingReview)

		reviewableOrdersAfter, err := orderRepo.ListByUser(ctx, testUserID, domain.OrderStatusBucketReviewable)
		require.NoError(t, err)
		for _, o := range reviewableOrdersAfter {
			if o.ID == testOrderID {
				t.Errorf("testOrderID should NOT be in reviewable bucket once all items are reviewed")
			}
		}
	})

	t.Run("GetUserReviews_PaginationAndFiltering", func(t *testing.T) {
		// Clean up
		_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id IN ($1, $2, $3)", testOrderItemA, testOrderItemB, testOrderItemC)

		// Create 3 reviews for testUserID
		revA, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Review A 5 stars",
			Media: []domain.CreateReviewMediaInput{
				{
					MediaType: domain.ReviewMediaTypeImage,
					MimeType:  "image/jpeg",
					ObjectKey: "reviews/test/imgA.jpg",
					SizeBytes: 1024,
					Position:  0,
				},
			},
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revA.ID)
		}()

		revB, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemB,
			Rating:      4,
			Comment:     "Review B 4 stars",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revB.ID)
		}()

		revC, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemC,
			Rating:      5,
			Comment:     "Review C 5 stars",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revC.ID)
		}()

		// 1. Get all reviews for testUserID (ratingFilter = 0)
		resAll, err := repo.GetUserReviews(ctx, testUserID, 0, 1, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(3), resAll.Total)
		assert.Len(t, resAll.Reviews, 3)
		assert.Equal(t, testOrderID, resAll.Reviews[0].Order.ID)
		assert.NotEmpty(t, resAll.Reviews[0].Product.Name)

		// Find revA in results and check media
		var foundRevA *domain.UserReview
		for i := range resAll.Reviews {
			if resAll.Reviews[i].ID == revA.ID {
				foundRevA = &resAll.Reviews[i]
				break
			}
		}
		require.NotNil(t, foundRevA)
		assert.True(t, foundRevA.CanEdit)
		assert.False(t, foundRevA.Edited)
		assert.Len(t, foundRevA.Media, 1)

		// 2. Filter by 5 stars
		res5, err := repo.GetUserReviews(ctx, testUserID, 5, 1, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(2), res5.Total)
		assert.Len(t, res5.Reviews, 2)
		for _, r := range res5.Reviews {
			assert.Equal(t, int16(5), r.Rating)
		}

		// 3. Filter by 4 stars
		res4, err := repo.GetUserReviews(ctx, testUserID, 4, 1, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(1), res4.Total)
		assert.Len(t, res4.Reviews, 1)
		assert.Equal(t, int16(4), res4.Reviews[0].Rating)

		// 4. Filter by 1 star (empty)
		res1, err := repo.GetUserReviews(ctx, testUserID, 1, 1, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(0), res1.Total)
		assert.Empty(t, res1.Reviews)

		// 5. Pagination (page 1, limit 2)
		resPage1, err := repo.GetUserReviews(ctx, testUserID, 0, 1, 2)
		require.NoError(t, err)
		assert.Equal(t, int64(3), resPage1.Total)
		assert.Len(t, resPage1.Reviews, 2)

		resPage2, err := repo.GetUserReviews(ctx, testUserID, 0, 2, 2)
		require.NoError(t, err)
		assert.Equal(t, int64(3), resPage2.Total)
		assert.Len(t, resPage2.Reviews, 1)

		// 6. Other user cannot see testUserID's reviews
		resOther, err := repo.GetUserReviews(ctx, otherUserID, 0, 1, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(0), resOther.Total)
		assert.Empty(t, resOther.Reviews)
	})
}
