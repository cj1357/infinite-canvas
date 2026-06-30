package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	repo *repository.Repository
	cfg  config.Config
}

type RegisterRequest struct {
	Email       string `json:"email"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResult struct {
	User  model.User `json:"user"`
	Token string     `json:"-"`
}

func NewAuthService(repo *repository.Repository, cfg config.Config) *AuthService {
	return &AuthService{repo: repo, cfg: cfg}
}

func (s *AuthService) Register(ctx context.Context, req RegisterRequest) (AuthResult, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	username := strings.TrimSpace(req.Username)
	displayName := strings.TrimSpace(req.DisplayName)
	if email == "" || !strings.Contains(email, "@") {
		return AuthResult{}, errors.New("请输入有效邮箱")
	}
	if username == "" {
		username = strings.Split(email, "@")[0]
	}
	if len(req.Password) < 8 {
		return AuthResult{}, errors.New("密码至少需要 8 位")
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return AuthResult{}, err
	}
	var result AuthResult
	err = s.repo.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txRepo := s.repo.WithTx(tx)
		total, err := txRepo.CountUsers()
		if err != nil {
			return err
		}
		role := model.UserRoleUser
		if total == 0 || (s.cfg.BootstrapAdminEmail != "" && email == s.cfg.BootstrapAdminEmail) {
			role = model.UserRoleAdmin
		}
		user := model.User{
			Email:        email,
			Username:     username,
			DisplayName:  displayName,
			PasswordHash: string(passwordHash),
			Role:         role,
			Status:       model.UserStatusActive,
		}
		if err := txRepo.CreateUser(&user); err != nil {
			return err
		}
		now := time.Now()
		account := defaultCreditAccount(user.ID, now)
		if err := txRepo.SaveCreditAccount(&account); err != nil {
			return err
		}
		token, err := s.createSession(txRepo, user.ID, now)
		if err != nil {
			return err
		}
		result = AuthResult{User: user, Token: token}
		return nil
	})
	return result, err
}

func (s *AuthService) Login(ctx context.Context, req LoginRequest) (AuthResult, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	user, err := s.repo.FindUserByEmail(email)
	if err != nil {
		return AuthResult{}, errors.New("邮箱或密码错误")
	}
	if user.Status != model.UserStatusActive {
		return AuthResult{}, errors.New("账号已被禁用")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		return AuthResult{}, errors.New("邮箱或密码错误")
	}
	now := time.Now()
	token, err := s.createSession(s.repo, user.ID, now)
	if err != nil {
		return AuthResult{}, err
	}
	_ = s.repo.TouchUserLogin(user.ID, now)
	return AuthResult{User: user, Token: token}, nil
}

func (s *AuthService) Logout(token string) error {
	if token == "" {
		return nil
	}
	return s.repo.RevokeSession(HashSessionToken(token), time.Now())
}

func (s *AuthService) UserFromToken(token string) (model.User, error) {
	if token == "" {
		return model.User{}, gorm.ErrRecordNotFound
	}
	session, err := s.repo.FindActiveSessionByHash(HashSessionToken(token), time.Now())
	if err != nil {
		return model.User{}, err
	}
	if session.User.Status != model.UserStatusActive {
		return model.User{}, errors.New("账号已被禁用")
	}
	return session.User, nil
}

func (s *AuthService) createSession(repo *repository.Repository, userID string, now time.Time) (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	session := model.Session{
		UserID:    userID,
		TokenHash: HashSessionToken(token),
		ExpiresAt: now.Add(s.cfg.SessionTTL),
	}
	return token, repo.CreateSession(&session)
}

func HashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func defaultCreditAccount(userID string, now time.Time) model.UserCreditAccount {
	return model.UserCreditAccount{
		UserID:          userID,
		PeriodStart:     now,
		PeriodEnd:       now.AddDate(0, 0, 7),
		FiveHourResetAt: now,
		ValidUntil:      now,
	}
}
