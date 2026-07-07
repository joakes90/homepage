package handlers

 import (
	 "html/template"
	 "net/http"
 )

var beltTuneTemplate = template.Must(template.ParseFiles("web/templates/belttune.html"))

func BeltTune(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/belttune" {
		http.NotFound(w, r)
		return
	}

	if err := beltTuneTemplate.Execute(w, nil); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
