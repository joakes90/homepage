package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joakes90/homepage/internal/handlers"
)

func main() {
	http.HandleFunc("/", handlers.Home)
	http.HandleFunc("/belttune", handlers.BeltTune)
	http.HandleFunc("/privacy", handlers.Privacy)
	http.HandleFunc("/primastrada", handlers.PrimaStrada)

	fs := http.FileServer(http.Dir("web/static/"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8282"
	}

	log.Println("Server running on port " + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
