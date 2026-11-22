function decode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

export async function readDashboard(url, encodedKey) {
  const bytes = decode(encodedKey);
  if (bytes.length !== 32) throw new Error('Nieprawidłowa długość klucza');
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Brak opublikowanych danych');
  const envelope = await response.json();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(envelope.iv) }, key, decode(envelope.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
