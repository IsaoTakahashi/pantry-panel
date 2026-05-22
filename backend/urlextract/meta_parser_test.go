package urlextract

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseMeta_OGTitleAndImage(t *testing.T) {
	html := []byte(`<html><head>
		<meta property="og:title" content="テスト商品">
		<meta property="og:image" content="https://example.com/img.jpg">
	</head></html>`)
	got := ParseMeta(html, "https://example.com")
	assert.Equal(t, "テスト商品", got.Name)
	assert.Equal(t, "https://example.com/img.jpg", got.ImageURL)
}

func TestParseMeta_OGTitleOnly(t *testing.T) {
	html := []byte(`<html><head>
		<meta property="og:title" content="商品名のみ">
	</head></html>`)
	got := ParseMeta(html, "https://example.com")
	assert.Equal(t, "商品名のみ", got.Name)
	assert.Equal(t, "", got.ImageURL)
}

func TestParseMeta_RelativeImageURL(t *testing.T) {
	html := []byte(`<html><head>
		<meta property="og:title" content="相対パス商品">
		<meta property="og:image" content="/images/product.png">
	</head></html>`)
	got := ParseMeta(html, "https://example.com/shop/")
	assert.Equal(t, "相対パス商品", got.Name)
	assert.Equal(t, "https://example.com/images/product.png", got.ImageURL)
}

func TestParseMeta_SchemaOrgProduct(t *testing.T) {
	html := []byte(`<html><head>
		<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "Product",
			"name": "スキーマ商品",
			"image": "https://example.com/schema-img.jpg"
		}
		</script>
	</head></html>`)
	got := ParseMeta(html, "https://example.com")
	assert.Equal(t, "スキーマ商品", got.Name)
	assert.Equal(t, "https://example.com/schema-img.jpg", got.ImageURL)
}

func TestParseMeta_SchemaOrgImageAsObject(t *testing.T) {
	html := []byte(`<html><head>
		<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "Product",
			"name": "オブジェクト画像商品",
			"image": {"@type": "ImageObject", "url": "https://example.com/obj-img.jpg"}
		}
		</script>
	</head></html>`)
	got := ParseMeta(html, "https://example.com")
	assert.Equal(t, "オブジェクト画像商品", got.Name)
	assert.Equal(t, "https://example.com/obj-img.jpg", got.ImageURL)
}

func TestParseMeta_SchemaOrgTypeArray(t *testing.T) {
	html := []byte(`<html><head>
		<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": ["Product", "Thing"],
			"name": "型配列商品",
			"image": "https://example.com/array-type-img.jpg"
		}
		</script>
	</head></html>`)
	got := ParseMeta(html, "https://example.com")
	assert.Equal(t, "型配列商品", got.Name)
	assert.Equal(t, "https://example.com/array-type-img.jpg", got.ImageURL)
}

func TestParseMeta_NoMetaTags(t *testing.T) {
	html := []byte(`<html><head><title>ページタイトル</title></head><body>本文</body></html>`)
	got := ParseMeta(html, "https://example.com")
	assert.Equal(t, Result{}, got)
}

func TestParseMeta_MalformedJSONLD(t *testing.T) {
	html := []byte(`<html><head>
		<script type="application/ld+json">
		{ this is not valid json !!!
		</script>
	</head></html>`)
	// Must not panic and must return empty Result
	got := ParseMeta(html, "https://example.com")
	assert.Equal(t, Result{}, got)
}
