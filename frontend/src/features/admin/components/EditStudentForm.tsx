import type { ComponentProps } from 'react'
import { CreateStudentForm } from './CreateStudentForm'

type EditStudentFormProps = Omit<ComponentProps<typeof CreateStudentForm>, 'isEditing'>

export function EditStudentForm(props: EditStudentFormProps) {
  return <CreateStudentForm {...props} isEditing={true} />
}
