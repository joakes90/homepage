package main

import (

	"fmt"

	"net/http"

	"github.com/joakes90/homepage/internal/handlers"
)

func main() {
	http.HandleFunc("/", handlers.Home)

	fs := http.FileServer(http.Dir("web/static/"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.ListenAndServe(":8282", nil)
	fmt.Println("Server running on port 8282")
}
