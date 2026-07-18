package handlers

import (
	"html/template"
	"net/http"
)

var primaStradaTemplate = template.Must(template.ParseFiles("web/templates/primastrada.html"))

 func PrimaStrada(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/primastrada" {
		http.NotFound(w, r)
		return
	}

	if err := primaStradaTemplate.Execute(w, nil); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
