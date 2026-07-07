package handlers

import (
	"html/template"
	"net/http"
)

var privacyTemplate = template.Must(template.ParseFiles("web/templates/privacy.html"))

 func Privacy(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/privacy" {
		http.NotFound(w, r)
		return
	}

	if err := privacyTemplate.Execute(w, nil); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
