package urlextract

import (
	"bytes"
	"encoding/json"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

// ParseMeta extracts product name and image URL from HTML bytes.
// It tries og:title / og:image first, then falls back to schema.org Product JSON-LD.
// baseURL is used to resolve relative image URLs to absolute.
// This function is pure — it performs no I/O.
func ParseMeta(htmlBytes []byte, baseURL string) Result {
	base, err := url.Parse(baseURL)
	if err != nil {
		base = nil
	}

	doc, err := html.Parse(bytes.NewReader(htmlBytes))
	if err != nil {
		return Result{}
	}

	var ogTitle, ogImage string
	var jsonLDNodes []string

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch strings.ToLower(n.Data) {
			case "meta":
				property, content := attrVal(n, "property"), attrVal(n, "content")
				switch property {
				case "og:title":
					if ogTitle == "" {
						ogTitle = content
					}
				case "og:image":
					if ogImage == "" {
						ogImage = content
					}
				}
			case "script":
				if attrVal(n, "type") == "application/ld+json" {
					if n.FirstChild != nil {
						jsonLDNodes = append(jsonLDNodes, n.FirstChild.Data)
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	// Priority 1: OpenGraph
	if ogTitle != "" {
		return Result{
			Name:     ogTitle,
			ImageURL: resolveURL(base, ogImage),
		}
	}

	// Priority 2: schema.org Product JSON-LD
	for _, raw := range jsonLDNodes {
		result, ok := parseJSONLD(raw, base)
		if ok {
			return result
		}
	}

	return Result{}
}

// attrVal returns the value of the named attribute on n, or "".
func attrVal(n *html.Node, name string) string {
	for _, a := range n.Attr {
		if a.Key == name {
			return a.Val
		}
	}
	return ""
}

// resolveURL resolves ref against base.  Returns ref unchanged if base is nil or ref is already absolute.
func resolveURL(base *url.URL, ref string) string {
	if ref == "" {
		return ""
	}
	if base == nil {
		return ref
	}
	refURL, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	return base.ResolveReference(refURL).String()
}

// parseJSONLD attempts to parse a JSON-LD block as a schema.org Product.
// Returns (Result, true) on success.
func parseJSONLD(raw string, base *url.URL) (Result, bool) {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return Result{}, false
	}

	typ, _ := data["@type"].(string)
	if !strings.EqualFold(typ, "Product") {
		return Result{}, false
	}

	name, _ := data["name"].(string)
	if name == "" {
		return Result{}, false
	}

	imageURL := extractJSONLDImage(data["image"])

	return Result{
		Name:     name,
		ImageURL: resolveURL(base, imageURL),
	}, true
}

// extractJSONLDImage extracts the image URL from the "image" field of a JSON-LD object.
// The field can be a string, an object with a "url" field, or a list of either.
func extractJSONLDImage(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case map[string]interface{}:
		if u, ok := val["url"].(string); ok {
			return u
		}
	case []interface{}:
		if len(val) > 0 {
			return extractJSONLDImage(val[0])
		}
	}
	return ""
}
