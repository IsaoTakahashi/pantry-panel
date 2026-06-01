interface Props {
  apiUrl?: string;
  supabaseUrl?: string;
}

export function PreconnectLinks({ apiUrl, supabaseUrl }: Props) {
  const api = apiUrl?.trim();
  const supabase = supabaseUrl?.trim();
  return (
    <>
      {api && <link rel="preconnect" href={api} crossOrigin="anonymous" />}
      {api && <link rel="dns-prefetch" href={api} />}
      {supabase && (
        <link rel="preconnect" href={supabase} crossOrigin="anonymous" />
      )}
      {supabase && <link rel="dns-prefetch" href={supabase} />}
    </>
  );
}
