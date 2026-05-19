package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
)

type GroupHandler struct {
	repo repository.GroupRepository
}

func NewGroupHandler(repo repository.GroupRepository) *GroupHandler {
	return &GroupHandler{repo: repo}
}

type CreateGroupRequest struct {
	Name string `json:"name"`
}

func (h *GroupHandler) CreateGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	existing, err := h.repo.FindMembershipByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	if existing != nil {
		return c.JSON(http.StatusConflict, ErrorResponse{Message: "Already a member of a group"})
	}

	var req CreateGroupRequest
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "name is required"})
	}

	group, err := h.repo.CreateGroup(c.Request().Context(), req.Name, authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusCreated, group)
}

func (h *GroupHandler) GetMyGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	membership, err := h.repo.FindMembershipByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	if membership == nil {
		return c.JSON(http.StatusNotFound, ErrorResponse{Message: "Not a member of any group"})
	}
	return c.JSON(http.StatusOK, membership)
}

func (h *GroupHandler) CreateInvitation(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}
	if authInfo.GroupID == uuid.Nil {
		return c.JSON(http.StatusForbidden, ErrorResponse{Message: "Not a member of any group"})
	}

	inv, err := h.repo.CreateInvitation(c.Request().Context(),
		authInfo.GroupID, authInfo.UserID, 7*24*time.Hour)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusCreated, inv)
}

func (h *GroupHandler) AcceptInvitation(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	token, err := uuid.Parse(c.Param("token"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid token"})
	}

	if err := h.repo.AcceptInvitation(c.Request().Context(), token, authInfo.UserID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return c.JSON(http.StatusNotFound, ErrorResponse{Message: "Invitation not found"})
		}
		if errors.Is(err, repository.ErrInvitationExpired) {
			return c.JSON(http.StatusGone, ErrorResponse{Message: "Invitation has expired"})
		}
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	membership, err := h.repo.FindMembershipByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil || membership == nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, membership)
}
