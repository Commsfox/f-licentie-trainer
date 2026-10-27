// F-licentie trainer als los programma: de hele app (HTML, JS, CSS, data en plaatjes) zit in dit
// bestand. Het start een kleine webserver op deze computer en opent de browser. Geen internet,
// GitHub of installatie nodig. Bouwen: zie build.sh.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

//go:embed all:app
var files embed.FS

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
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		// Geen accountserver in de losse versie: accounts uitzetten (voortgang blijft in de browser bewaard).
		if r.URL.Path == "/js/config.js" {
			b, err := fs.ReadFile(app, "js/config.js")
			if err == nil {
				w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
				w.Write([]byte(strings.Replace(string(b), "BACKEND = 'pocketbase'", "BACKEND = 'lokaal'", 1)))
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
	fmt.Println("sluit het venster om de app te stoppen. Je voortgang blijft in je browser bewaard.")
	go func() { time.Sleep(400 * time.Millisecond); openBrowser(url) }()
	if err := http.Serve(ln, mux); err != nil {
		fmt.Println("De server is gestopt:", err)
		wait()
	}
}
