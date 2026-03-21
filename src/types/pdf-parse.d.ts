declare module 'pdf-parse' {
  interface PdfData {
    numpages: number
    numrender: number
    info: Record<string, any>
    metadata: any
    text: string
    version: string
  }

  function pdfParse(dataBuffer: Buffer, options?: Record<string, any>): Promise<PdfData>

  export = pdfParse
}

declare module 'pdf-parse/lib/pdf-parse' {
  import pdfParse from 'pdf-parse'
  export default pdfParse
}
