package domain

import (
	"context"
	"io"
	"strings"
	"time"
)

// Content and file constraints
const (
	MaxPostContentLength    = 5000
	MinPostContentLength    = 1
	MaxCommentContentLength = 1000
	MinCommentContentLength = 1
	MaxImageSizeBytes       = int64(10 * 1024 * 1024) // 10MB = 10485760 bytes
	MaxVideoSizeBytes       = int64(50 * 1024 * 1024) // 50MB = 52428800 bytes
	MaxReferredProducts     = 10
	MinReferredProducts     = 1
	MaxMediaAttachments     = 10
)

var allowedImageMimes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

var allowedVideoMimes = map[string]bool{
	"video/mp4":  true,
	"video/webm": true,
}

func IsValidMediaMimeType(mime string) bool {
	lower := strings.ToLower(strings.TrimSpace(mime))
	return allowedImageMimes[lower] || allowedVideoMimes[lower]
}

func IsImageMimeType(mime string) bool {
	return allowedImageMimes[strings.ToLower(strings.TrimSpace(mime))]
}

func IsVideoMimeType(mime string) bool {
	return allowedVideoMimes[strings.ToLower(strings.TrimSpace(mime))]
}

// ReactionType represents one of the 6 supported reaction states.
type ReactionType string

const (
	ReactionTypeLike  ReactionType = "like"
	ReactionTypeLove  ReactionType = "love"
	ReactionTypeHaha  ReactionType = "haha"
	ReactionTypeWow   ReactionType = "wow"
	ReactionTypeSad   ReactionType = "sad"
	ReactionTypeAngry ReactionType = "angry"
)

var ValidReactionTypes = map[ReactionType]bool{
	ReactionTypeLike:  true,
	ReactionTypeLove:  true,
	ReactionTypeHaha:  true,
	ReactionTypeWow:   true,
	ReactionTypeSad:   true,
	ReactionTypeAngry: true,
}

func (r ReactionType) IsValid() bool {
	return ValidReactionTypes[r]
}

type ReactionCounts struct {
	Like  int `json:"like"`
	Love  int `json:"love"`
	Haha  int `json:"haha"`
	Wow   int `json:"wow"`
	Sad   int `json:"sad"`
	Angry int `json:"angry"`
}

type ReactionSummary struct {
	TotalCount     int            `json:"totalCount"`
	Counts         ReactionCounts `json:"counts"`
	ViewerReaction *ReactionType  `json:"viewerReaction"`
}

type PostMediaType string

const (
	PostMediaTypeImage PostMediaType = "image"
	PostMediaTypeVideo PostMediaType = "video"
)

type PostMediaAttachment struct {
	ID        string        `json:"id"`
	FileURL   string        `json:"fileUrl"`
	FileType  PostMediaType `json:"fileType"`
	FileName  string        `json:"fileName"`
	FileSize  int64         `json:"fileSize"`
	MimeType  string        `json:"mimeType"`
	Position   int           `json:"position"`
	ObjectKey  string        `json:"-"`
	PostID     *string       `json:"-"`
	UploaderID string        `json:"-"`
}

type ReferredProductCard struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Brand    string `json:"brand"`
	Price    string `json:"price"`
	Currency string `json:"currency"`
	ImageURL string `json:"imageUrl"`
	InStock  bool   `json:"inStock"`
	Active   bool   `json:"active"`
}

type PostItem struct {
	ID               string                `json:"id"`
	AuthorID         string                `json:"authorId"`
	AuthorName       string                `json:"authorName"`
	AuthorRole       string                `json:"authorRole"`
	Content          string                `json:"content"`
	Media            []PostMediaAttachment `json:"media"`
	ReferredProducts []ReferredProductCard `json:"referredProducts"`
	Reactions        ReactionSummary       `json:"reactions"`
	CommentCount     int                   `json:"commentCount"`
	CreatedAt        time.Time             `json:"createdAt"`
	UpdatedAt        time.Time             `json:"updatedAt"`
}

type PostComment struct {
	ID              string          `json:"id"`
	PostID          string          `json:"postId"`
	AuthorID        string          `json:"authorId"`
	AuthorName      string          `json:"authorName"`
	AuthorRole      string          `json:"authorRole"`
	ParentID        *string         `json:"parentId"`
	ReplyToUserID   *string         `json:"replyToUserId"`
	ReplyToUserName *string         `json:"replyToUserName"`
	Content         string          `json:"content"`
	Reactions       ReactionSummary `json:"reactions"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

type PostCommentThread struct {
	PostComment
	Replies []PostComment `json:"replies"`
}

type PostDetail struct {
	PostItem
	Comments []PostCommentThread `json:"comments"`
}

type NotificationCategory string

const (
	NotificationCategoryPost NotificationCategory = "post"
)

type PostNotificationType string

const (
	NotificationTypePostReaction    PostNotificationType = "post_reaction"
	NotificationTypePostComment     PostNotificationType = "post_comment"
	NotificationTypeCommentReaction PostNotificationType = "comment_reaction"
	NotificationTypeCommentReply    PostNotificationType = "comment_reply"
)

func NotificationGroupKeyPostReaction(postID string) string {
	return "post_reaction:" + strings.TrimSpace(postID)
}

func NotificationGroupKeyCommentReaction(commentID string) string {
	return "comment_reaction:" + strings.TrimSpace(commentID)
}

func NotificationGroupKeyPostComment(postID string) string {
	return "post_comment:" + strings.TrimSpace(postID)
}

func NotificationGroupKeyCommentReply(parentCommentID string) string {
	return "comment_reply:" + strings.TrimSpace(parentCommentID)
}

type NotificationActorSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

type NotificationItem struct {
	ID               string                 `json:"id"`
	RecipientID      string                 `json:"recipientId"`
	ActorID          *string                `json:"actorId"`
	ActorName        *string                `json:"actorName"`
	ActorRole        *string                `json:"actorRole"`
	GroupKey         string                 `json:"groupKey"`
	ActorCount       int                    `json:"actorCount"`
	Category         NotificationCategory   `json:"category"`
	NotificationType PostNotificationType   `json:"notificationType"`
	PostID           *string                `json:"postId"`
	CommentID        *string                `json:"commentId"`
	ReactionType     *ReactionType          `json:"reactionType"`
	Excerpt          string                 `json:"excerpt"`
	Metadata         map[string]interface{} `json:"metadata"`
	IsRead           bool                   `json:"isRead"`
	CreatedAt        time.Time              `json:"createdAt"`
	UpdatedAt        time.Time              `json:"updatedAt"`
}

type PostNotification = NotificationItem

type NotificationsListResult struct {
	Items       []NotificationItem `json:"items"`
	UnreadCount int                `json:"unreadCount"`
}

// NotificationBroadcaster sends real-time notifications via WebSocket.
type NotificationBroadcaster interface {
	BroadcastNotification(ctx context.Context, recipientID string, notification *NotificationItem) error
}

// PostMediaStore defines object storage operations for post media.
type PostMediaStore interface {
	PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error
	StatObject(ctx context.Context, objectKey string) (*ChatObjectInfo, error)
	GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error)
	GetObjectRange(ctx context.Context, objectKey string, start, length int64) (io.ReadCloser, error)
	RemoveObject(ctx context.Context, objectKey string) error
	RemoveObjects(ctx context.Context, objectKeys []string) error
}

// Repository and UseCase models
type CreatePostInput struct {
	AuthorID           string
	Content            string
	MediaIDs           []string
	ReferredProductIDs []string
}

type UpdatePostInput struct {
	PostID             string
	Content            string
	MediaIDs           []string
	ReferredProductIDs []string
}

type ListPostsFilter struct {
	ViewerUserID *string
	Limit        int
	Offset       int
}

type CreateCommentInput struct {
	PostID          string
	AuthorID        string
	ParentCommentID *string
	Content         string
}

type CreateNotificationInput struct {
	RecipientID      string
	ActorID          *string
	GroupKey         string
	ActorCount       int
	Category         NotificationCategory
	NotificationType PostNotificationType
	PostID           *string
	CommentID        *string
	ReactionType     *ReactionType
	Excerpt          string
	Metadata         map[string]interface{}
}

type PostRepository interface {
	// Post CRUD
	CreatePost(ctx context.Context, input CreatePostInput) (*PostDetail, error)
	GetPostByID(ctx context.Context, postID string, viewerUserID *string) (*PostDetail, error)
	ListPosts(ctx context.Context, filter ListPostsFilter) ([]PostItem, int, error)
	UpdatePost(ctx context.Context, input UpdatePostInput) (*PostDetail, error)
	DeletePost(ctx context.Context, postID string) error

	// Media
	CreatePendingMedia(ctx context.Context, uploaderID string, objectKey string, fileType PostMediaType, fileName string, fileSize int64, mimeType string) (*PostMediaAttachment, error)
	GetMediaByID(ctx context.Context, mediaID string) (*PostMediaAttachment, error)
	GetMediaByIDs(ctx context.Context, mediaIDs []string) ([]PostMediaAttachment, error)
	DeleteMedia(ctx context.Context, mediaID string) (string, error)

	// Reactions
	SetPostReaction(ctx context.Context, postID string, userID string, reaction *ReactionType) (*ReactionSummary, *ReactionType, error)
	SetCommentReaction(ctx context.Context, commentID string, userID string, reaction *ReactionType) (*ReactionSummary, *ReactionType, error)

	// Comments
	CreateComment(ctx context.Context, input CreateCommentInput) (*PostComment, error)
	DeleteComment(ctx context.Context, commentID string) (deletedID string, newCount int, err error)
	GetCommentByID(ctx context.Context, commentID string) (*PostComment, error)

	// Notifications
	CreateNotification(ctx context.Context, input CreateNotificationInput) (*NotificationItem, error)
	DeleteUnreadNotificationByGroupKey(ctx context.Context, recipientID, groupKey string) error
	SyncUnreadReactionNotification(ctx context.Context, recipientID, groupKey string, postID, commentID *string) (*NotificationItem, error)
	ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*NotificationsListResult, error)
	MarkNotificationRead(ctx context.Context, notificationID string, recipientID string) (*NotificationItem, error)
	MarkAllNotificationsRead(ctx context.Context, recipientID string) error
	GetUnreadNotificationCount(ctx context.Context, recipientID string) (int, error)
}

type CreatePostRequest struct {
	Content            string   `json:"content"`
	MediaIDs           []string `json:"mediaIds"`
	ReferredProductIDs []string `json:"referredProductIds"`
}

type UpdatePostRequest struct {
	Content            string   `json:"content"`
	MediaIDs           []string `json:"mediaIds"`
	ReferredProductIDs []string `json:"referredProductIds"`
}

type ReactionRequest struct {
	Reaction *ReactionType `json:"reaction"`
}

type CreateCommentRequest struct {
	Content         string  `json:"content"`
	ParentCommentID *string `json:"parentCommentId"`
}

type PostUseCase interface {
	// Admin Post Management
	CreatePost(ctx context.Context, adminID string, req CreatePostRequest) (*PostDetail, error)
	UpdatePost(ctx context.Context, adminID string, postID string, req UpdatePostRequest) (*PostDetail, error)
	DeletePost(ctx context.Context, adminID string, postID string) error
	UploadMedia(ctx context.Context, adminID string, fileName string, reader io.Reader, size int64, mimeType string) (*PostMediaAttachment, error)

	// Public & Authenticated Posts
	ListPosts(ctx context.Context, viewerUserID *string, page, limit int) ([]PostItem, int, int, error)
	GetPostByID(ctx context.Context, viewerUserID *string, postID string) (*PostDetail, error)
	GetMediaStream(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *PostMediaAttachment, int64, error)

	// Interactions
	ReactToPost(ctx context.Context, userID string, postID string, reaction *ReactionType) (*ReactionSummary, error)
	ReactToComment(ctx context.Context, userID string, commentID string, reaction *ReactionType) (*ReactionSummary, error)
	CreateComment(ctx context.Context, userID string, postID string, req CreateCommentRequest) (*PostComment, error)
	DeleteComment(ctx context.Context, userID string, userRole string, postID string, commentID string) (string, int, error)

	// Notifications
	ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*NotificationsListResult, error)
	MarkNotificationRead(ctx context.Context, recipientID string, notificationID string) (*NotificationItem, int, error)
	MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error)
}
