package middleware

import (
	"net/http"
	"strings"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
)

const authInfoKey = "authInfo"

type AuthInfo struct {
	UserID  uuid.UUID
	GroupID uuid.UUID // アクティブグループ未設定なら uuid.Nil
	Role    string    // アクティブグループ未設定なら ""
}

type JWTAuthConfig struct {
	KeyFunc      jwt.Keyfunc
	GroupRepo    repository.GroupRepository
	RequireGroup bool
}

func NewJWTAuth(cfg JWTAuthConfig) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			token, err := jwt.Parse(tokenStr, cfg.KeyFunc,
				jwt.WithValidMethods([]string{"RS256", "HS256", "ES256"}))
			if err != nil || !token.Valid {
				return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
			}
			subStr, err := claims.GetSubject()
			if err != nil {
				return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
			}
			userID, err := uuid.Parse(subStr)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
			}

			info := &AuthInfo{UserID: userID}

			if cfg.RequireGroup {
				activeGroupHeader := c.Request().Header.Get("X-Active-Group-ID")
				if activeGroupHeader == "" {
					return c.JSON(http.StatusForbidden, apierror.ErrorResponse{Message: "X-Active-Group-ID header is required"})
				}
				activeGroupID, err := uuid.Parse(activeGroupHeader)
				if err != nil {
					return c.JSON(http.StatusForbidden, apierror.ErrorResponse{Message: "Invalid X-Active-Group-ID"})
				}

				memberships, err := cfg.GroupRepo.FindMembershipsByUserID(c.Request().Context(), userID)
				if err != nil {
					return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
				}

				var found *repository.GroupMembership
				for i := range memberships {
					if memberships[i].GroupID == activeGroupID {
						found = &memberships[i]
						break
					}
				}
				if found == nil {
					return c.JSON(http.StatusForbidden, apierror.ErrorResponse{Message: "Not a member of the specified group"})
				}

				info.GroupID = found.GroupID
				info.Role = found.Role
			}

			c.Set(authInfoKey, info)
			return next(c)
		}
	}
}

func GetAuthInfo(c *echo.Context) (*AuthInfo, bool) {
	v, ok := c.Get(authInfoKey).(*AuthInfo)
	return v, ok
}

// SetAuthInfo はテスト用のヘルパー。handler テストで AuthInfo をコンテキストに注入する。
func SetAuthInfo(c *echo.Context, info *AuthInfo) {
	c.Set(authInfoKey, info)
}
