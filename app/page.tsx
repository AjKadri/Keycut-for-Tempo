import template from '../lib/design/index.json'
import { snapshots, snapshotMarkup } from '../lib/snapshots'
import { DesignPage } from '../components/design-page'
export const dynamic = 'force-dynamic'
export default async function Home() { return <DesignPage page="home" html={snapshotMarkup(template, await snapshots())} /> }
