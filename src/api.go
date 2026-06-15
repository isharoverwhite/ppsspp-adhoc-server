package main

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/souler/ppsspp-adhoc-go/state"
)

// JSON representations
type StatusResponse struct {
	UserCount int          `json:"usercount"`
	Games     []GameStatus `json:"games"`
}

type GameStatus struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	UserCount uint32        `json:"usercount"`
	Groups    []GroupStatus `json:"groups"`
}

type GroupStatus struct {
	Name      string       `json:"name"`
	UserCount uint32       `json:"usercount"`
	Users     []UserStatus `json:"users"`
}

type UserStatus struct {
	Name string `json:"name"`
	MAC  string `json:"mac"`
	IP   string `json:"ip"` // Optional, format as dotted quad if needed
}

func startHTTPAPI(s *state.ServerState) {
	port := os.Getenv("ADHOC_API_PORT")
	if port == "" {
		port = "8080" // Default API port for Webapp to fetch
	}

	http.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		
		s.Mu.RLock()
		defer s.Mu.RUnlock()

		resp := StatusResponse{
			UserCount: len(s.Users),
			Games:     make([]GameStatus, 0, len(s.Games)),
		}

		for _, game := range s.Games {
			gameName := game.Name
			if cachedName, ok := s.DB.GetGameName(game.ProductCode); ok {
				gameName = cachedName
			}

			gs := GameStatus{
				ID:        game.ProductCode,
				Name:      gameName,
				UserCount: game.PlayerCount,
				Groups:    make([]GroupStatus, 0),
			}

			// Add real groups
			for _, group := range game.Groups {
				grp := GroupStatus{
					Name:      group.Name,
					UserCount: group.PlayerCount,
					Users:     make([]UserStatus, 0, len(group.Players)),
				}
				for _, user := range group.Players {
					grp.Users = append(grp.Users, UserStatus{
						Name: user.Name,
						MAC:  user.MACString(),
					})
				}
				gs.Groups = append(gs.Groups, grp)
			}

			// Find users in this game but NOT in any group
			grouplessUsers := make([]UserStatus, 0)
			for _, user := range s.Users {
				if user.Game != nil && user.Game.ProductCode == game.ProductCode && user.Group == nil {
					grouplessUsers = append(grouplessUsers, UserStatus{
						Name: user.Name,
						MAC:  user.MACString(),
					})
				}
			}

			if len(grouplessUsers) > 0 {
				gs.Groups = append(gs.Groups, GroupStatus{
					Name:      "Groupless",
					UserCount: uint32(len(grouplessUsers)),
					Users:     grouplessUsers,
				})
			}

			resp.Games = append(resp.Games, gs)
		}

		json.NewEncoder(w).Encode(resp)
	})

	go func() {
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			panic(err)
		}
	}()
}
