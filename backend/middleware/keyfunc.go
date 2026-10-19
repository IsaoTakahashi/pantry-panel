package middleware

import (
	"context"
	"errors"
	"fmt"

	keyfunc "github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// ErrSigningKeyUnavailable は、トークンの kid に対応する署名鍵を鍵ストアから解決できなかったことを表す。
// JWKS の取得失敗・取り直しの制限待ち・未知の kid のいずれでも返る。トークン自体の不備ではないため、
// NewJWTAuth はこのエラーを 401 ではなく 503 にする。
var ErrSigningKeyUnavailable = errors.New("signing key unavailable")

// NewKeyStoreFirstKeyfunc は k の鍵ストアを先に引く jwt.Keyfunc を返す。
//
// トークンのヘッダーに文字列の kid があれば Storage().KeyRead で鍵を読み、読めなければ
// ErrSigningKeyUnavailable で包んで返す。読めたとき、または kid が無い・文字列でないときは、
// 検証（alg・use の照合と鍵の返却）を元の k.Keyfunc に任せる。
//
// keyfunc 自身のエラーでは判別できない（障害中の 2 回目以降は取り直しのレートリミッターの待ちで失敗し、
// jwkset.ErrKeyNotFound を含まない）ため、このラッパーで判別する。
// 元の keyfunc も鍵ストアを読むが、2 回目はキャッシュから返るので通信は増えない。
func NewKeyStoreFirstKeyfunc(k keyfunc.Keyfunc) jwt.Keyfunc {
	return func(token *jwt.Token) (any, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return k.Keyfunc(token)
		}
		if _, err := k.Storage().KeyRead(context.Background(), kid); err != nil {
			return nil, fmt.Errorf("%w: kid %q: %w", ErrSigningKeyUnavailable, kid, err)
		}
		return k.Keyfunc(token)
	}
}
