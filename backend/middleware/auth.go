package middleware

import (
	"net/http"
	"strings"

	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
)

const authInfoKey = "authInfo"

type AuthInfo struct {
	UserID  uuid.UUID
	GroupID uuid.UUID // グループ未所属なら uuid.Nil
	Role    string    // グループ未所属なら ""
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
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			token, err := jwt.Parse(tokenStr, cfg.KeyFunc,
				jwt.WithValidMethods([]string{"RS256", "HS256", "ES256"}))
			if err != nil || !token.Valid {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}
			subStr, err := claims.GetSubject()
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}
			userID, err := uuid.Parse(subStr)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}

			info := &AuthInfo{UserID: userID}

			membership, err := cfg.GroupRepo.FindMembershipByUserID(c.Request().Context(), userID)
			if err != nil {
				return c.JSON(http.StatusInternalServerError, map[string]string{"message": "Internal Server Error"})
			}
			if membership != nil {
				info.GroupID = membership.GroupID
				info.Role = membership.Role
			} else if cfg.RequireGroup {
				return c.JSON(http.StatusForbidden, map[string]string{"message": "Not a member of any group"})
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
