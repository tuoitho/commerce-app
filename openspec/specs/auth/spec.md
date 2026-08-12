## Purpose

Lets users create an account, sign in, maintain a secure authenticated session via JWT access and refresh tokens, and sign out from both the backend API and the React frontend.

## Requirements

### Requirement: User registration

The system SHALL allow a new user to register with email and password. Registration SHALL validate the email format and the password (minimum 8 characters), reject an email already in use, hash the password before storing it, and on success return an authenticated session.

#### Scenario: Successful registration

- **WHEN** a client POSTs `/api/v1/auth/register` with a valid, unused email and a password of at least 8 characters
- **THEN** the system responds `201 Created` with the created user's id and email, an access token in the response body, and a refresh token in an `httpOnly` cookie

#### Scenario: Registration with invalid email

- **WHEN** a client POSTs `/api/v1/auth/register` with an email that is not a valid email address
- **THEN** the system responds `400 Bad Request` and no user is created

#### Scenario: Registration with short password

- **WHEN** a client POSTs `/api/v1/auth/register` with a password shorter than 8 characters
- **THEN** the system responds `400 Bad Request` and no user is created

#### Scenario: Registration with duplicate email

- **WHEN** a client POSTs `/api/v1/auth/register` with an email that already exists
- **THEN** the system responds `409 Conflict` and no duplicate user row is created

### Requirement: Login

The system SHALL allow an existing user to log in with email and password, and on success return an authenticated session (access token in body, refresh token in an `httpOnly` cookie).

#### Scenario: Successful login

- **WHEN** a client POSTs `/api/v1/auth/login` with the correct email and password of an existing user
- **THEN** the system responds `200 OK` with the user's id and email, an access token, and a refresh token cookie

#### Scenario: Login with unknown email

- **WHEN** a client POSTs `/api/v1/auth/login` with an email that has no account
- **THEN** the system responds `401 Unauthorized` and does not issue any token

#### Scenario: Login with wrong password

- **WHEN** a client POSTs `/api/v1/auth/login` with a valid email but an incorrect password
- **THEN** the system responds `401 Unauthorized` and does not issue any token

### Requirement: Access token validation on protected endpoints

The system SHALL require a valid, unexpired access token to access protected endpoints (for example the current-user profile endpoint).

#### Scenario: Access with valid access token

- **WHEN** a client calls a protected endpoint with a valid, unexpired access bearer token
- **THEN** the system responds with the requested data

#### Scenario: Access with missing or invalid token

- **WHEN** a client calls a protected endpoint with no token, a malformed token, or an expired token
- **THEN** the system responds `401 Unauthorized` with an error response body

### Requirement: Refresh token rotation

The system SHALL accept a valid unexpired refresh token to issue a new pair of access and refresh tokens, and SHALL invalidate the presented refresh token after use. Only one active refresh token per session exists at a time.

#### Scenario: Successful refresh

- **WHEN** a client POSTs `/api/v1/auth/refresh` with a valid unexpired refresh token
- **THEN** the system responds `200 OK` with a new access token and a new refresh token, and the presented refresh token can no longer be used

#### Scenario: Refresh with expired, revoked, or unknown refresh token

- **WHEN** a client POSTs `/api/v1/auth/refresh` with an expired, already-used, revoked, or unknown refresh token
- **THEN** the system responds `401 Unauthorized` and issues no tokens

### Requirement: Logout

The system SHALL allow an authenticated user to log out, which SHALL revoke the presented refresh token so it can no longer be used.

#### Scenario: Successful logout

- **WHEN** an authenticated client POSTs `/api/v1/auth/logout` with a valid refresh token
- **THEN** the system revokes the token and responds `204 No Content`

### Requirement: Current user profile

The system SHALL return the authenticated user's profile (id, email) from the protected profile endpoint.

#### Scenario: Fetch current user

- **WHEN** a client calls `GET /api/v1/auth/me` with a valid access token
- **THEN** the system responds `200 OK` with the user's id and email

#### Scenario: Fetch current user without valid token

- **WHEN** a client calls `GET /api/v1/auth/me` without a valid access token
- **THEN** the system responds `401 Unauthorized`

### Requirement: Error response contract

The system SHALL return API errors as JSON with a stable shape `{"error":{"code":"...","message":"..."}}` and an appropriate HTTP status code. Validation failures SHALL list the offending fields.

#### Scenario: Error response shape

- **WHEN** any API endpoint returns an error
- **THEN** the response body SHALL be JSON matching the error contract and the HTTP status SHALL be the appropriate 4xx/5xx code

#### Scenario: Validation error fields

- **WHEN** a request fails validation (for example registration with a bad email)
- **THEN** the error response SHALL include the list of fields that failed validation

### Requirement: Credential and session security

The system SHALL protect stored credentials and session material: passwords stored hashed with a strong algorithm (bcrypt), refresh tokens stored only as hashes, access tokens signed with a secret, short-lived access tokens, and refresh tokens delivered only via `httpOnly` cookies.

#### Scenario: Secrets never returned to clients

- **WHEN** any API response is returned
- **THEN** no response SHALL contain a password or a raw refresh token in the body

#### Scenario: Refresh token is httpOnly

- **WHEN** a refresh token is issued
- **THEN** it SHALL be set as an `httpOnly` cookie that client-side JavaScript cannot read

### Requirement: Registration page

The frontend SHALL provide a registration page with email and password inputs, client-side validation, submission to the register endpoint, and navigation to the restricted app area after success.

#### Scenario: Successful registration on the page

- **WHEN** the user submits valid email and password on the registration page
- **THEN** the frontend receives the session, stores the access token, and redirects to the restricted home page

#### Scenario: Registration error shown

- **WHEN** registration fails (for example duplicate email)
- **THEN** the frontend displays the error message from the API without redirecting

### Requirement: Login page

The frontend SHALL provide a login page with email and password inputs and submission to the login endpoint, and SHALL navigate to the restricted app area after success.

#### Scenario: Successful login on the page

- **WHEN** the user submits valid credentials on the login page
- **THEN** the frontend receives the session, stores the access token, and redirects to the restricted home page

#### Scenario: Login error shown

- **WHEN** login fails (bad credentials)
- **THEN** the frontend displays the error message and stays on the login page

### Requirement: Session persistence and restoration

The frontend SHALL keep the user signed in across page reloads, restore the session using the refresh endpoint when the access token is missing or expired, and sign the user out when refresh fails.

#### Scenario: Restore session after reload

- **WHEN** the app loads and a valid refresh token cookie exists but no access token is held
- **THEN** the frontend calls the refresh endpoint and restores the authenticated session

#### Scenario: Logout on failed refresh

- **WHEN** the refresh endpoint rejects the stored session
- **THEN** the frontend clears local auth state and redirects to the login page

### Requirement: Protected app area

The frontend SHALL route unauthenticated users away from the restricted app area to the login page.

#### Scenario: Anonymous access to protected route

- **WHEN** an unauthenticated user tries to open the restricted home page
- **THEN** the frontend redirects them to the login page

#### Scenario: Authenticated access to protected route

- **WHEN** an authenticated user opens the restricted home page
- **THEN** the frontend renders the page and shows the logged-in user's email and a logout control