export function assertImportSecret(request: Request) {
  const expected = process.env.IMPORT_SECRET;
  const actual = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || actual !== expected) throw new Error('UNAUTHORIZED');
}
