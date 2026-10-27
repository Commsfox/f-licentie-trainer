// F-licentie trainer als los programma: de hele app (HTML, JS, CSS, data en plaatjes) zit in dit
// bestand. Het start een kleine webserver op deze computer en opent de browser. Geen internet,
// GitHub of installatie nodig. Bouwen: zie build.sh.
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

//go:embed all:app
var files embed.FS

// Script dat de voortgang uit de browser in een bestand op deze computer bewaart (zie voortgang.js).
//
//go:embed voortgang.js
var voortgangJS []byte

// Voortgangsbestand: Windows %AppData%\F-licentie-trainer, macOS ~/Library/Application Support/..., Linux ~/.config/...
func dataFile() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir, _ = os.UserHomeDir()
	}
	return filepath.Join(dir, "F-licentie-trainer", "voortgang.json")
}

var mu sync.Mutex

// handleVoortgang: GET geeft het bestand terug (met het pad), PUT/POST schrijft het (eerst naar een tijdelijk
// bestand, dan hernoemen, zodat een half geschreven bestand nooit de voortgang kapotmaakt).
func handleVoortgang(w http.ResponseWriter, r *http.Request) {
	// Alleen de app zelf mag schrijven: een andere website in dezelfde browser zou anders de voortgang kunnen wissen.
	if o := r.Header.Get("Origin"); o != "" && o != fmt.Sprintf("http://localhost:%d", port) && o != fmt.Sprintf("http://127.0.0.1:%d", port) {
		http.Error(w, "niet toegestaan", http.StatusForbidden)
		return
	}
	path := dataFile()
	mu.Lock()
	defer mu.Unlock()
	switch r.Method {
	case http.MethodGet:
		var data json.RawMessage = []byte("null")
		if b, err := os.ReadFile(path); err == nil && json.Valid(b) {
			data = b
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"pad": path, "data": data})
	case http.MethodPut, http.MethodPost:
		b, err := io.ReadAll(io.LimitReader(r.Body, 50<<20))
		if err != nil || !json.Valid(b) {
			http.Error(w, "ongeldige voortgang", http.StatusBadRequest)
			return
		}
		tmp := path + ".tmp"
		err = os.MkdirAll(filepath.Dir(path), 0o755)
		if err == nil {
			err = os.WriteFile(tmp, b, 0o644)
		}
		if err == nil {
			err = os.Rename(tmp, path)
		}
		if err != nil {
			fmt.Println("Kan de voortgang niet opslaan:", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "niet toegestaan", http.StatusMethodNotAllowed)
	}
}

// Vaste poort: de browser bewaart de voortgang per adres, dus elke keer hetzelfde adres = dezelfde voortgang.
const port = 47830

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func wait() {
	fmt.Println("\nDruk op Enter om dit venster te sluiten.")
	fmt.Scanln()
}

func main() {
	url := fmt.Sprintf("http://localhost:%d/", port)
	app, _ := fs.Sub(files, "app")
	static := http.FileServer(http.FS(app))
	mux := http.NewServeMux()
	mux.HandleFunc("/api/voortgang", handleVoortgang)
	mux.HandleFunc("/voortgang.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Write(voortgangJS)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		// Geen accountserver in de losse versie: de voortgang gaat naar een bestand op deze computer.
		if r.URL.Path == "/js/config.js" {
			b, err := fs.ReadFile(app, "js/config.js")
			if err == nil {
				w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
				w.Write([]byte(strings.Replace(string(b), "BACKEND = 'pocketbase'", "BACKEND = 'bestand'", 1)))
				return
			}
		}
		// Het voortgang-script als allereerste in de pagina laden, vóór de app de opslag leest.
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			b, err := fs.ReadFile(app, "index.html")
			if err == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Write([]byte(strings.Replace(string(b), "<head>", "<head>\n  <script src=\"voortgang.js\"></script>", 1)))
				return
			}
		}
		static.ServeHTTP(w, r)
	})

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		// Draait de app al (bijv. tweede keer dubbelklikken)? Dan alleen de browser openen.
		if c, e := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second); e == nil {
			c.Close()
			fmt.Println("De F-licentie trainer draait al. Ik open hem in je browser.")
			openBrowser(url)
			time.Sleep(2 * time.Second)
			return
		}
		fmt.Println("Kan de app niet starten:", err)
		wait()
		os.Exit(1)
	}
	fmt.Println("F-licentie trainer")
	fmt.Println("==================")
	fmt.Println("De app draait op", url)
	fmt.Println("Je browser gaat vanzelf open. Laat dit venster open zolang je oefent;")
	fmt.Println("sluit het venster om de app te stoppen.")
	fmt.Println("Je voortgang wordt bewaard in:", dataFile())
	go func() { time.Sleep(400 * time.Millisecond); openBrowser(url) }()
	if err := http.Serve(ln, mux); err != nil {
		fmt.Println("De server is gestopt:", err)
		wait()
	}
}
