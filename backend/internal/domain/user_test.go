package domain

import "testing"

func TestUserPublic_IncludesProfileAndAvatarURL(t *testing.T) {
	u := &User{
		ID:    "user-1",
		Email: "khach@example.com",
		Role:  RoleCustomer,
	}
	pub := u.Public()
	if pub.DisplayName != nil || pub.Phone != nil || pub.AvatarURL != nil {
		t.Fatalf("expected nil profile fields for default user, got %+v", pub)
	}

	name := "Nguyễn Minh Anh"
	phone := "0912345678"
	avatarKey := "550e8400-e29b-41d4-a716-446655440000.webp"
	u.DisplayName = &name
	u.Phone = &phone
	u.AvatarKey = &avatarKey

	pub = u.Public()
	if pub.DisplayName == nil || *pub.DisplayName != name {
		t.Fatalf("DisplayName = %v, want %q", pub.DisplayName, name)
	}
	if pub.Phone == nil || *pub.Phone != phone {
		t.Fatalf("Phone = %v, want %q", pub.Phone, phone)
	}
	wantURL := "/media/avatars/" + avatarKey
	if pub.AvatarURL == nil || *pub.AvatarURL != wantURL {
		t.Fatalf("AvatarURL = %v, want %q", pub.AvatarURL, wantURL)
	}

	blank := "   "
	u.AvatarKey = &blank
	pub = u.Public()
	if pub.AvatarURL != nil {
		t.Fatalf("expected nil AvatarURL for blank avatarKey, got %q", *pub.AvatarURL)
	}
}
