import Scanner from '@/components/scanner';
export default async function ScannerPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Scanner key={id} id={id} />; }
