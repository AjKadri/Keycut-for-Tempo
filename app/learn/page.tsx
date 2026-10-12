import template from '../../lib/design/learn.json'
import { snapshots, snapshotMarkup } from '../../lib/snapshots'
import { DesignPage } from '../../components/design-page'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'What are access keys? · Keycut' }
export default async function Learn() { return <DesignPage page="learn" html={snapshotMarkup(template, await snapshots())} /> }
