import { type Locator, type Page } from '@playwright/test'

export class AccountPageObject {
  readonly page: Page
  readonly headerAccountLink: Locator
  readonly mobileMenuToggle: Locator
  readonly mobileAccountLink: Locator
  readonly tablist: Locator
  readonly profileTab: Locator
  readonly passwordTab: Locator
  readonly addressesTab: Locator

  readonly emailInput: Locator
  readonly displayNameInput: Locator
  readonly phoneInput: Locator
  readonly saveProfileButton: Locator
  readonly avatarFileInput: Locator
  readonly uploadAvatarButton: Locator
  readonly deleteAvatarButton: Locator

  readonly currentPasswordInput: Locator
  readonly newPasswordInput: Locator
  readonly confirmNewPasswordInput: Locator
  readonly changePasswordButton: Locator

  readonly addAddressButton: Locator
  readonly confirmDeleteButton: Locator

  constructor(page: Page) {
    this.page = page
    this.headerAccountLink = page.getByTestId('header-account-link')
    this.mobileMenuToggle = page.getByTestId('mobile-menu-toggle')
    this.mobileAccountLink = page.getByTestId('mobile-account-link')
    this.tablist = page.getByRole('tablist', { name: 'Mục quản lý tài khoản' })
    this.profileTab = page.getByRole('tab', { name: /Hồ sơ cá nhân/i })
    this.passwordTab = page.getByRole('tab', { name: /Đổi mật khẩu/i })
    this.addressesTab = page.getByRole('tab', { name: /Sổ địa chỉ/i })

    this.emailInput = page.locator('#account-email')
    this.displayNameInput = page.locator('#account-displayName')
    this.phoneInput = page.locator('#account-phone')
    this.saveProfileButton = page.getByRole('button', { name: /Lưu thay đổi/i })
    this.avatarFileInput = page.getByTestId('avatar-file-input')
    this.uploadAvatarButton = page.getByRole('button', { name: /Tải ảnh mới/i })
    this.deleteAvatarButton = page.getByRole('button', { name: /Xóa ảnh/i })

    this.currentPasswordInput = page.locator('#currentPassword')
    this.newPasswordInput = page.locator('#newPassword')
    this.confirmNewPasswordInput = page.locator('#confirmNewPassword')
    this.changePasswordButton = page.getByRole('button', { name: /Đổi mật khẩu/i })

    this.addAddressButton = page.getByRole('button', { name: /Thêm địa chỉ mới/i })
    this.confirmDeleteButton = page.getByRole('button', { name: /Xác nhận xóa/i })
  }

  async goto(tab?: 'profile' | 'password' | 'addresses'): Promise<void> {
    await this.page.goto(tab ? `/account?tab=${tab}` : '/account')
  }

  addressCard(id: string): Locator {
    return this.page.getByTestId(`address-card-${id}`)
  }
}
