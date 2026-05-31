interface Props {
  apiUrl?: string;
  supabaseUrl?: string;
}

export function PreconnectLinks({ apiUrl, supabaseUrl }: Props) {
  return (
    <>
      {apiUrl && (
        <link rel="preconnect" href={apiUrl} crossOrigin="anonymous" />
      )}
      {apiUrl && <link rel="dns-prefetch" href={apiUrl} />}
      {supabaseUrl && (
        <link rel="preconnect" href={supabaseUrl} crossOrigin="anonymous" />
      )}
      {supabaseUrl && <link rel="dns-prefetch" href={supabaseUrl} />}
    </>
  );
}
