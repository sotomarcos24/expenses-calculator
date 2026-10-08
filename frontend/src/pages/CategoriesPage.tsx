import { PageHeader } from '../components/PageHeader.tsx'
import { Placeholder } from '../components/Placeholder.tsx'

export function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="Organise transactions into categories and subcategories."
      />
      <Placeholder milestone={3} />
    </>
  )
}
