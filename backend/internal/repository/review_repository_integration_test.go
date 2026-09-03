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
		res0, err := repo.GetPublicReviewsByProductID(ctx, testProduct, nil, 1, 10)
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
		res, err := repo.GetPublicReviewsByProductID(ctx, testProduct, nil, 1, 10)
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

	t.Run("AdminReply_Lifecycle_Integration", func(t *testing.T) {
		// Clean up
		_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id = $1", testOrderItemA)

		// 1. Create initial review
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Đánh giá gốc của khách hàng",
		})
		require.NoError(t, err)
		require.NotNil(t, rev)
		assert.Nil(t, rev.AdminReply)
		assert.Nil(t, rev.AdminRepliedAt)

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
		}()

		// 2. Create admin reply
		replyText1 := "Cảm ơn bạn đã phản hồi!"
		updatedRev1, err := repo.UpdateAdminReply(ctx, rev.ID, &replyText1)
		require.NoError(t, err)
		require.NotNil(t, updatedRev1)
		require.NotNil(t, updatedRev1.AdminReply)
		assert.Equal(t, replyText1, *updatedRev1.AdminReply)
		require.NotNil(t, updatedRev1.AdminRepliedAt)

		// Verify reply entity in database
		var replyID1 string
		var content1 string
		err = pool.QueryRow(ctx, "SELECT id, content FROM review_replies WHERE review_id = $1", rev.ID).Scan(&replyID1, &content1)
		require.NoError(t, err)
		assert.Equal(t, replyText1, content1)
		assert.NotEmpty(t, replyID1)

		// Verify GetReviewByID returns reply
		getByID, err := repo.GetReviewByID(ctx, rev.ID)
		require.NoError(t, err)
		require.NotNil(t, getByID.AdminReply)
		assert.Equal(t, replyText1, *getByID.AdminReply)
		require.NotNil(t, getByID.AdminRepliedAt)

		// Verify GetReviewByOrderItemID returns reply
		getByItem, err := repo.GetReviewByOrderItemID(ctx, testOrderItemA)
		require.NoError(t, err)
		require.NotNil(t, getByItem.AdminReply)
		assert.Equal(t, replyText1, *getByItem.AdminReply)

		// Verify ListReviewsByOrderItemIDs returns reply
		byItems, err := repo.ListReviewsByOrderItemIDs(ctx, []string{testOrderItemA})
		require.NoError(t, err)
		require.Contains(t, byItems, testOrderItemA)
		require.NotNil(t, byItems[testOrderItemA].AdminReply)
		assert.Equal(t, replyText1, *byItems[testOrderItemA].AdminReply)

		// Verify GetPublicReviewsByProductID returns reply
		publicRes, err := repo.GetPublicReviewsByProductID(ctx, testProduct, nil, 1, 10)
		require.NoError(t, err)
		require.NotEmpty(t, publicRes.Reviews)
		require.NotNil(t, publicRes.Reviews[0].AdminReply)
		assert.Equal(t, replyText1, *publicRes.Reviews[0].AdminReply)

		// Verify GetUserReviews returns reply
		userRes, err := repo.GetUserReviews(ctx, testUserID, 0, 1, 10)
		require.NoError(t, err)
		require.NotEmpty(t, userRes.Reviews)
		require.NotNil(t, userRes.Reviews[0].AdminReply)
		assert.Equal(t, replyText1, *userRes.Reviews[0].AdminReply)

		// Verify GetAdminReviews returns reply
		adminRes, err := repo.GetAdminReviews(ctx, 0, "yes", 1, 10)
		require.NoError(t, err)
		require.NotEmpty(t, adminRes.Reviews)
		require.NotNil(t, adminRes.Reviews[0].AdminReply)
		assert.Equal(t, replyText1, *adminRes.Reviews[0].AdminReply)

		// 3. Add votes to review and reply
		var reviewVoteID, replyVoteID string
		err = pool.QueryRow(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, $2, NULL, 'helpful')
			RETURNING id
		`, testUserID, rev.ID).Scan(&reviewVoteID)
		require.NoError(t, err)

		err = pool.QueryRow(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, NULL, $2, 'helpful')
			RETURNING id
		`, testUserID, replyID1).Scan(&replyVoteID)
		require.NoError(t, err)

		// 4. Update reply: same UUID preserved, reply vote preserved (Req 4.4)
		replyText2 := "Cảm ơn bạn rất nhiều vì đã đánh giá 5 sao!"
		updatedRev2, err := repo.UpdateAdminReply(ctx, rev.ID, &replyText2)
		require.NoError(t, err)
		require.NotNil(t, updatedRev2.AdminReply)
		assert.Equal(t, replyText2, *updatedRev2.AdminReply)

		var replyIDAfterUpdate string
		var contentAfterUpdate string
		err = pool.QueryRow(ctx, "SELECT id, content FROM review_replies WHERE review_id = $1", rev.ID).Scan(&replyIDAfterUpdate, &contentAfterUpdate)
		require.NoError(t, err)
		assert.Equal(t, replyID1, replyIDAfterUpdate, "Reply UUID must be preserved across updates")
		assert.Equal(t, replyText2, contentAfterUpdate)

		var replyVoteCountAfterUpdate int
		err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE id = $1", replyVoteID).Scan(&replyVoteCountAfterUpdate)
		require.NoError(t, err)
		assert.Equal(t, 1, replyVoteCountAfterUpdate, "Reply vote must remain intact when reply is edited")

		// 5. Update review: review vote preserved (Req 4.3)
		updatedReview, _, err := repo.UpdateReview(ctx, domain.UpdateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			ReviewID:    rev.ID,
			Rating:      5,
			Comment:     "Đánh giá sau khi chỉnh sửa",
		})
		require.NoError(t, err)
		assert.True(t, updatedReview.Edited)

		var reviewVoteCountAfterUpdate int
		err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE id = $1", reviewVoteID).Scan(&reviewVoteCountAfterUpdate)
		require.NoError(t, err)
		assert.Equal(t, 1, reviewVoteCountAfterUpdate, "Review vote must remain intact when review is edited")

		// 6. Delete reply: deletes reply entity and cascades reply votes (Req 4.5)
		deletedRev, err := repo.UpdateAdminReply(ctx, rev.ID, nil)
		require.NoError(t, err)
		assert.Nil(t, deletedRev.AdminReply)
		assert.Nil(t, deletedRev.AdminRepliedAt)

		var replyCountAfterDelete int
		_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM review_replies WHERE review_id = $1", rev.ID).Scan(&replyCountAfterDelete)
		assert.Equal(t, 0, replyCountAfterDelete, "Reply entity must be deleted")

		var replyVoteCountAfterDelete int
		_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE id = $1", replyVoteID).Scan(&replyVoteCountAfterDelete)
		assert.Equal(t, 0, replyVoteCountAfterDelete, "Reply vote must be cascade deleted when reply is deleted")

		// Review vote must still exist
		var reviewVoteCountStillExists int
		_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE id = $1", reviewVoteID).Scan(&reviewVoteCountStillExists)
		assert.Equal(t, 1, reviewVoteCountStillExists, "Review vote must NOT be affected by reply deletion")

		// 7. Recreate reply: gets a NEW UUID and starts with 0 votes (Req 4.6)
		recreatedText := "Phản hồi mới sau khi đã xóa"
		recreatedRev, err := repo.UpdateAdminReply(ctx, rev.ID, &recreatedText)
		require.NoError(t, err)
		require.NotNil(t, recreatedRev.AdminReply)
		assert.Equal(t, recreatedText, *recreatedRev.AdminReply)

		var replyID2 string
		err = pool.QueryRow(ctx, "SELECT id FROM review_replies WHERE review_id = $1", rev.ID).Scan(&replyID2)
		require.NoError(t, err)
		assert.NotEqual(t, replyID1, replyID2, "Recreated reply must generate a new UUID")

		var recreatedReplyVotesCount int
		_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE reply_id = $1", replyID2).Scan(&recreatedReplyVotesCount)
		assert.Equal(t, 0, recreatedReplyVotesCount, "Recreated reply starts with 0 votes")
	})

	t.Run("GetPublicReviews_HelpfulnessAggregationAndViewerState", func(t *testing.T) {
		// Clean up
		_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE order_item_id IN ($1, $2, $3)", testOrderItemA, testOrderItemB, testOrderItemC)

		// 1. Create two reviews
		revA, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Đánh giá A",
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
			Comment:     "Đánh giá B",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", revB.ID)
		}()

		// 2. Add reply to revA
		replyText := "Phản hồi từ shop cho đánh giá A"
		_, err = repo.UpdateAdminReply(ctx, revA.ID, &replyText)
		require.NoError(t, err)

		var replyIDA string
		err = pool.QueryRow(ctx, "SELECT id FROM review_replies WHERE review_id = $1", revA.ID).Scan(&replyIDA)
		require.NoError(t, err)

		// 3. Insert votes:
		// revA: testUserID -> helpful, otherUserID -> helpful (total: helpful=2, unhelpful=0)
		_, err = pool.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, $2, NULL, 'helpful'), ($3, $2, NULL, 'helpful')
		`, testUserID, revA.ID, otherUserID)
		require.NoError(t, err)

		// revB: otherUserID -> unhelpful (total: helpful=0, unhelpful=1)
		_, err = pool.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, $2, NULL, 'unhelpful')
		`, otherUserID, revB.ID)
		require.NoError(t, err)

		// replyIDA: testUserID -> helpful, otherUserID -> unhelpful (total: helpful=1, unhelpful=1)
		_, err = pool.Exec(ctx, `
			INSERT INTO review_helpfulness_votes (user_id, review_id, reply_id, vote)
			VALUES ($1, NULL, $2, 'helpful'), ($3, NULL, $2, 'unhelpful')
		`, testUserID, replyIDA, otherUserID)
		require.NoError(t, err)

		// 4. Test Anonymous (viewerUserID == nil)
		anonRes, err := repo.GetPublicReviewsByProductID(ctx, testProduct, nil, 1, 10)
		require.NoError(t, err)
		require.Len(t, anonRes.Reviews, 2)

		// Reviews are ordered newest first: revB was created after revA (or check by ID)
		var anonRevA, anonRevB *domain.PublicReview
		for i := range anonRes.Reviews {
			if anonRes.Reviews[i].ID == revA.ID {
				anonRevA = &anonRes.Reviews[i]
			} else if anonRes.Reviews[i].ID == revB.ID {
				anonRevB = &anonRes.Reviews[i]
			}
		}
		require.NotNil(t, anonRevA)
		require.NotNil(t, anonRevB)

		// revA assertions for Anonymous
		assert.Equal(t, int64(2), anonRevA.Helpfulness.HelpfulCount)
		assert.Equal(t, int64(0), anonRevA.Helpfulness.UnhelpfulCount)
		assert.Nil(t, anonRevA.Helpfulness.ViewerVote)
		require.NotNil(t, anonRevA.AdminReply)
		assert.Equal(t, replyText, *anonRevA.AdminReply)
		require.NotNil(t, anonRevA.AdminReplyID)
		assert.Equal(t, replyIDA, *anonRevA.AdminReplyID)
		require.NotNil(t, anonRevA.AdminReplyHelpfulness)
		assert.Equal(t, int64(1), anonRevA.AdminReplyHelpfulness.HelpfulCount)
		assert.Equal(t, int64(1), anonRevA.AdminReplyHelpfulness.UnhelpfulCount)
		assert.Nil(t, anonRevA.AdminReplyHelpfulness.ViewerVote)

		// revB assertions for Anonymous (no reply)
		assert.Equal(t, int64(0), anonRevB.Helpfulness.HelpfulCount)
		assert.Equal(t, int64(1), anonRevB.Helpfulness.UnhelpfulCount)
		assert.Nil(t, anonRevB.Helpfulness.ViewerVote)
		assert.Nil(t, anonRevB.AdminReply)
		assert.Nil(t, anonRevB.AdminReplyID)
		assert.Nil(t, anonRevB.AdminReplyHelpfulness)

		// 5. Test Customer 1 (testUserID)
		uid1 := testUserID
		cust1Res, err := repo.GetPublicReviewsByProductID(ctx, testProduct, &uid1, 1, 10)
		require.NoError(t, err)
		var cust1RevA, cust1RevB *domain.PublicReview
		for i := range cust1Res.Reviews {
			if cust1Res.Reviews[i].ID == revA.ID {
				cust1RevA = &cust1Res.Reviews[i]
			} else if cust1Res.Reviews[i].ID == revB.ID {
				cust1RevB = &cust1Res.Reviews[i]
			}
		}
		require.NotNil(t, cust1RevA)
		require.NotNil(t, cust1RevB)

		// revA for Customer 1: helpful vote on review and helpful vote on reply
		require.NotNil(t, cust1RevA.Helpfulness.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *cust1RevA.Helpfulness.ViewerVote)
		require.NotNil(t, cust1RevA.AdminReplyHelpfulness)
		require.NotNil(t, cust1RevA.AdminReplyHelpfulness.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *cust1RevA.AdminReplyHelpfulness.ViewerVote)

		// revB for Customer 1: no vote
		assert.Nil(t, cust1RevB.Helpfulness.ViewerVote)

		// 6. Test Customer 2 (otherUserID)
		uid2 := otherUserID
		cust2Res, err := repo.GetPublicReviewsByProductID(ctx, testProduct, &uid2, 1, 10)
		require.NoError(t, err)
		var cust2RevA, cust2RevB *domain.PublicReview
		for i := range cust2Res.Reviews {
			if cust2Res.Reviews[i].ID == revA.ID {
				cust2RevA = &cust2Res.Reviews[i]
			} else if cust2Res.Reviews[i].ID == revB.ID {
				cust2RevB = &cust2Res.Reviews[i]
			}
		}
		require.NotNil(t, cust2RevA)
		require.NotNil(t, cust2RevB)

		// revA for Customer 2: helpful vote on review, unhelpful vote on reply
		require.NotNil(t, cust2RevA.Helpfulness.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *cust2RevA.Helpfulness.ViewerVote)
		require.NotNil(t, cust2RevA.AdminReplyHelpfulness)
		require.NotNil(t, cust2RevA.AdminReplyHelpfulness.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteUnhelpful, *cust2RevA.AdminReplyHelpfulness.ViewerVote)

		// revB for Customer 2: unhelpful vote on review
		require.NotNil(t, cust2RevB.Helpfulness.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteUnhelpful, *cust2RevB.Helpfulness.ViewerVote)

		// 7. Test Customer 3 (non-voting user)
		nonVotingUID := "22222222-3333-4444-5555-666666666666"
		cust3Res, err := repo.GetPublicReviewsByProductID(ctx, testProduct, &nonVotingUID, 1, 10)
		require.NoError(t, err)
		for _, r := range cust3Res.Reviews {
			assert.Nil(t, r.Helpfulness.ViewerVote)
			if r.AdminReplyHelpfulness != nil {
				assert.Nil(t, r.AdminReplyHelpfulness.ViewerVote)
			}
		}
	})

	t.Run("SetReviewVote_SetChangeRemoveIdempotency", func(t *testing.T) {
		// 1. Create a review
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Vote review test",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
		}()

		helpful := domain.HelpfulnessVoteHelpful
		unhelpful := domain.HelpfulnessVoteUnhelpful

		// 2. Set helpful vote
		state1, err := repo.SetReviewVote(ctx, rev.ID, testUserID, &helpful)
		require.NoError(t, err)
		require.NotNil(t, state1)
		assert.Equal(t, int64(1), state1.HelpfulCount)
		assert.Equal(t, int64(0), state1.UnhelpfulCount)
		require.NotNil(t, state1.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *state1.ViewerVote)

		// 3. Idempotent same-state vote (send helpful again) -> no count increase
		state1Idempotent, err := repo.SetReviewVote(ctx, rev.ID, testUserID, &helpful)
		require.NoError(t, err)
		assert.Equal(t, int64(1), state1Idempotent.HelpfulCount)
		assert.Equal(t, int64(0), state1Idempotent.UnhelpfulCount)
		require.NotNil(t, state1Idempotent.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *state1Idempotent.ViewerVote)

		// 4. Change vote to unhelpful -> helpful decreases, unhelpful increases
		state2, err := repo.SetReviewVote(ctx, rev.ID, testUserID, &unhelpful)
		require.NoError(t, err)
		assert.Equal(t, int64(0), state2.HelpfulCount)
		assert.Equal(t, int64(1), state2.UnhelpfulCount)
		require.NotNil(t, state2.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteUnhelpful, *state2.ViewerVote)

		// 5. Remove vote (vote = nil) -> unhelpful decreases to 0, viewerVote is nil
		state3, err := repo.SetReviewVote(ctx, rev.ID, testUserID, nil)
		require.NoError(t, err)
		assert.Equal(t, int64(0), state3.HelpfulCount)
		assert.Equal(t, int64(0), state3.UnhelpfulCount)
		assert.Nil(t, state3.ViewerVote)

		// 6. Non-existent review -> ErrReviewNotFound
		_, err = repo.SetReviewVote(ctx, "00000000-0000-0000-0000-000000000000", testUserID, &helpful)
		require.Error(t, err)
		assert.Equal(t, domain.ErrReviewNotFound, err)
	})

	t.Run("SetReviewReplyVote_SetChangeRemoveIdempotency_AndStaleUUID", func(t *testing.T) {
		// 1. Create a review and reply
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Reply vote test",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
		}()

		replyText := "Phản hồi thử nghiệm vote"
		_, err = repo.UpdateAdminReply(ctx, rev.ID, &replyText)
		require.NoError(t, err)

		var replyID string
		err = pool.QueryRow(ctx, "SELECT id FROM review_replies WHERE review_id = $1", rev.ID).Scan(&replyID)
		require.NoError(t, err)

		helpful := domain.HelpfulnessVoteHelpful
		unhelpful := domain.HelpfulnessVoteUnhelpful

		// 2. Set helpful on reply
		rpState1, err := repo.SetReviewReplyVote(ctx, replyID, testUserID, &helpful)
		require.NoError(t, err)
		assert.Equal(t, int64(1), rpState1.HelpfulCount)
		assert.Equal(t, int64(0), rpState1.UnhelpfulCount)
		require.NotNil(t, rpState1.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *rpState1.ViewerVote)

		// 3. Change to unhelpful on reply
		rpState2, err := repo.SetReviewReplyVote(ctx, replyID, testUserID, &unhelpful)
		require.NoError(t, err)
		assert.Equal(t, int64(0), rpState2.HelpfulCount)
		assert.Equal(t, int64(1), rpState2.UnhelpfulCount)
		assert.Equal(t, domain.HelpfulnessVoteUnhelpful, *rpState2.ViewerVote)

		// 4. Remove vote on reply
		rpState3, err := repo.SetReviewReplyVote(ctx, replyID, testUserID, nil)
		require.NoError(t, err)
		assert.Equal(t, int64(0), rpState3.HelpfulCount)
		assert.Equal(t, int64(0), rpState3.UnhelpfulCount)
		assert.Nil(t, rpState3.ViewerVote)

		// 5. Non-existent reply -> ErrReviewReplyNotFound
		_, err = repo.SetReviewReplyVote(ctx, "00000000-0000-0000-0000-000000000000", testUserID, &helpful)
		require.Error(t, err)
		assert.Equal(t, domain.ErrReviewReplyNotFound, err)

		// 6. Delete reply and recreate reply -> old replyID returns ErrReviewReplyNotFound (Req 4.6)
		_, err = repo.UpdateAdminReply(ctx, rev.ID, nil) // delete
		require.NoError(t, err)

		recreatedReply := "Phản hồi tạo lại mới"
		_, err = repo.UpdateAdminReply(ctx, rev.ID, &recreatedReply)
		require.NoError(t, err)

		// Vote on old stale replyID must fail with ErrReviewReplyNotFound
		_, err = repo.SetReviewReplyVote(ctx, replyID, testUserID, &helpful)
		require.Error(t, err)
		assert.Equal(t, domain.ErrReviewReplyNotFound, err)
	})

	t.Run("TargetIsolation_ReviewAndReplyVotesAreIndependent", func(t *testing.T) {
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Isolation test",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
		}()

		replyText := "Phản hồi isolation test"
		_, err = repo.UpdateAdminReply(ctx, rev.ID, &replyText)
		require.NoError(t, err)

		var replyID string
		err = pool.QueryRow(ctx, "SELECT id FROM review_replies WHERE review_id = $1", rev.ID).Scan(&replyID)
		require.NoError(t, err)

		helpful := domain.HelpfulnessVoteHelpful
		unhelpful := domain.HelpfulnessVoteUnhelpful

		// Customer 1 votes helpful on review
		rState, err := repo.SetReviewVote(ctx, rev.ID, testUserID, &helpful)
		require.NoError(t, err)
		assert.Equal(t, int64(1), rState.HelpfulCount)
		assert.Equal(t, int64(0), rState.UnhelpfulCount)

		// Customer 1 votes unhelpful on reply
		rpState, err := repo.SetReviewReplyVote(ctx, replyID, testUserID, &unhelpful)
		require.NoError(t, err)
		assert.Equal(t, int64(0), rpState.HelpfulCount)
		assert.Equal(t, int64(1), rpState.UnhelpfulCount)

		// Verify review counts are still (1, 0)
		uid := testUserID
		pubRes, err := repo.GetPublicReviewsByProductID(ctx, testProduct, &uid, 1, 10)
		require.NoError(t, err)
		require.NotEmpty(t, pubRes.Reviews)
		assert.Equal(t, int64(1), pubRes.Reviews[0].Helpfulness.HelpfulCount)
		assert.Equal(t, int64(0), pubRes.Reviews[0].Helpfulness.UnhelpfulCount)
		require.NotNil(t, pubRes.Reviews[0].Helpfulness.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *pubRes.Reviews[0].Helpfulness.ViewerVote)

		require.NotNil(t, pubRes.Reviews[0].AdminReplyHelpfulness)
		assert.Equal(t, int64(0), pubRes.Reviews[0].AdminReplyHelpfulness.HelpfulCount)
		assert.Equal(t, int64(1), pubRes.Reviews[0].AdminReplyHelpfulness.UnhelpfulCount)
		require.NotNil(t, pubRes.Reviews[0].AdminReplyHelpfulness.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteUnhelpful, *pubRes.Reviews[0].AdminReplyHelpfulness.ViewerVote)
	})

	t.Run("SameUser_ConcurrentVotes_EndInSingleValidState", func(t *testing.T) {
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Same user concurrent test",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
		}()

		helpful := domain.HelpfulnessVoteHelpful
		unhelpful := domain.HelpfulnessVoteUnhelpful

		var wg sync.WaitGroup
		votes := []*domain.HelpfulnessVote{&helpful, &unhelpful, nil, &helpful}
		results := make([]*domain.HelpfulnessState, len(votes))
		errs := make([]error, len(votes))

		for i := 0; i < len(votes); i++ {
			idx := i
			wg.Add(1)
			go func() {
				defer wg.Done()
				res, err := repo.SetReviewVote(ctx, rev.ID, testUserID, votes[idx])
				results[idx] = res
				errs[idx] = err
			}()
		}
		wg.Wait()

		for i := 0; i < len(votes); i++ {
			require.NoError(t, errs[i])
			require.NotNil(t, results[i])
			assert.GreaterOrEqual(t, results[i].HelpfulCount, int64(0))
			assert.GreaterOrEqual(t, results[i].UnhelpfulCount, int64(0))
			assert.LessOrEqual(t, results[i].HelpfulCount+results[i].UnhelpfulCount, int64(1))
		}

		// Verify database has at most 1 vote row for (testUserID, rev.ID)
		var rowCount int
		err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM review_helpfulness_votes WHERE user_id = $1 AND review_id = $2", testUserID, rev.ID).Scan(&rowCount)
		require.NoError(t, err)
		assert.LessOrEqual(t, rowCount, 1)
	})

	t.Run("TwoCustomer_ConcurrentVotes_LockSerialization", func(t *testing.T) {
		rev, err := repo.CreateReview(ctx, domain.CreateReviewInput{
			UserID:      testUserID,
			OrderID:     testOrderID,
			OrderItemID: testOrderItemA,
			Rating:      5,
			Comment:     "Two customer concurrency test",
		})
		require.NoError(t, err)
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM product_reviews WHERE id = $1", rev.ID)
		}()

		helpful := domain.HelpfulnessVoteHelpful

		var wg sync.WaitGroup
		results := make([]*domain.HelpfulnessState, 2)
		errs := make([]error, 2)
		users := []string{testUserID, otherUserID}

		for i := 0; i < 2; i++ {
			idx := i
			wg.Add(1)
			go func() {
				defer wg.Done()
				res, err := repo.SetReviewVote(ctx, rev.ID, users[idx], &helpful)
				results[idx] = res
				errs[idx] = err
			}()
		}
		wg.Wait()

		require.NoError(t, errs[0])
		require.NoError(t, errs[1])
		require.NotNil(t, results[0])
		require.NotNil(t, results[1])

		// Due to target row FOR UPDATE serialization:
		// One writer commits first -> its response total is 1
		// Second writer commits second -> its response total is 2
		total1 := results[0].HelpfulCount + results[0].UnhelpfulCount
		total2 := results[1].HelpfulCount + results[1].UnhelpfulCount

		totals := []int64{total1, total2}
		assert.Contains(t, totals, int64(1), "One serialized writer must observe total count 1")
		assert.Contains(t, totals, int64(2), "The second serialized writer must observe total count 2")

		// Final database count must be 2
		var finalHelpfulCount, finalUnhelpfulCount int64
		err = pool.QueryRow(ctx, "SELECT COUNT(*) FILTER (WHERE vote = 'helpful')::bigint, COUNT(*) FILTER (WHERE vote = 'unhelpful')::bigint FROM review_helpfulness_votes WHERE review_id = $1", rev.ID).Scan(&finalHelpfulCount, &finalUnhelpfulCount)
		require.NoError(t, err)
		assert.Equal(t, int64(2), finalHelpfulCount)
		assert.Equal(t, int64(0), finalUnhelpfulCount)
	})
}
