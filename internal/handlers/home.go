package handlers

import (
	"html/template"
	"net/http"
)

var homeTemplate = template.Must(template.ParseFiles("web/templates/home.html"))

func Home(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	if err := homeTemplate.Execute(w, nil); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
