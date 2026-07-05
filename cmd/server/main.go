package main

import (
	"net/http"

	"github.com/joakes90/homepage/internal/handlers"
)

func main() {
	http.HandleFunc("/", handlers.Home)

	fs := http.FileServer(http.Dir("web/static/"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.ListenAndServe(":80", nil)
}
