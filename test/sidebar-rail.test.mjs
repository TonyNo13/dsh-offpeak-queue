// dsh-offpeak-queue — collapsed sidebar rail geometry (56px rail)
//
// The sidebar footer seat (`sidebar.footer.action`) is a horizontal strip the
// shell centres inside the rail column. With more than one registrant the strip
// is wider than the rail, so every icon in it lands outside the 36px column the
// other rail rows use. The client must therefore (1) mark its own entry when the
// seat reports the rail, (2) drop the wide-mode leading seam there, and (3) pin
// the seat to a column while the rail is active.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

test('the sidebar entry marks the rail from the seat wide prop', () => {
  assert.match(client, /const rail = Boolean\(props && props\.wide === false\)/)
  assert.match(client, /'data-oq-rail': rail \? 'rail' : undefined/)
})

test('the rail drops the wide-mode leading seam so the badge stays centred', () => {
  assert.ok(
    client.includes('.oqLayer[data-oq-rail="rail"]{margin:0}'),
    'missing the rail margin reset for .oqLayer',
  )
})

test('the rail pins the footer seat to a column like every other rail row', () => {
  assert.ok(
    client.includes('*:has(> [data-slot="sidebar.footer.action"] .oqLayer[data-oq-rail="rail"]){flex-direction:column'),
    'missing the rail seat pin',
  )
})
