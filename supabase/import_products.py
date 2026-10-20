import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


NAMESPACE = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "relationship": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
DEFAULT_WORKBOOK = Path(__file__).resolve().parents[1] / "Extras" / "ProdutosFinal.xlsx"
BATCH_SIZE = 100


def normalize(value):
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(character)
    )


def read_workbook(path):
    with zipfile.ZipFile(path) as workbook:
        workbook_xml = ET.fromstring(workbook.read("xl/workbook.xml"))
        relationships_xml = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        relationships = {item.attrib["Id"]: item.attrib["Target"] for item in relationships_xml}
        shared_strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            strings_xml = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(part.text or "" for part in item.findall(".//main:t", NAMESPACE))
                for item in strings_xml.findall("main:si", NAMESPACE)
            ]

        sheet = workbook_xml.find("main:sheets", NAMESPACE)[0]
        sheet_path = relationships[sheet.attrib[f"{{{NAMESPACE['relationship']}}}id"]].lstrip("/")
        if not sheet_path.startswith("xl/"):
            sheet_path = f"xl/{sheet_path}"
        sheet_xml = ET.fromstring(workbook.read(sheet_path))

        rows = []
        for row in sheet_xml.findall(".//main:sheetData/main:row", NAMESPACE):
            values = {}
            for cell in row.findall("main:c", NAMESPACE):
                column = re.match(r"[A-Z]+", cell.attrib["r"]).group()
                value = cell.find("main:v", NAMESPACE)
                if value is None:
                    inline = cell.find("main:is", NAMESPACE)
                    values[column] = (
                        "".join(part.text or "" for part in inline.findall(".//main:t", NAMESPACE))
                        if inline is not None
                        else ""
                    )
                elif cell.attrib.get("t") == "s":
                    values[column] = shared_strings[int(value.text)]
                else:
                    values[column] = value.text or ""
            rows.append((int(row.attrib["r"]), values))

    header_index = next(
        (
            index
            for index, (_, values) in enumerate(rows)
            if any(normalize(value.strip()) == "descricao" for value in values.values())
        ),
        None,
    )
    if header_index is None:
        raise ValueError("Não foi possível localizar o cabeçalho Descrição na planilha.")

    headers = {
        normalize(value.strip()): column
        for column, value in rows[header_index][1].items()
    }
    if not {"descricao", "referencia", "preco"}.issubset(headers):
        raise ValueError("A planilha precisa conter as colunas Descrição, Referência e Preço.")

    products = []
    for row_number, values in rows[header_index + 1 :]:
        name = values.get(headers["descricao"], "").strip()
        if not name:
            continue

        raw_price = values.get(headers["preco"], "").strip()
        if not raw_price:
            raise ValueError(f"Preço ausente na linha {row_number}: {name}")
        price_cents = int(
            Decimal(raw_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) * 100
        )

        sku = values.get(headers["referencia"], "").strip()
        if sku and re.fullmatch(r"\d+(?:\.0+)?", sku):
            sku = str(int(Decimal(sku)))

        products.append(
            {
                "source_row": row_number,
                "name": name,
                "sku": sku,
                "price_cents": price_cents,
                "image": "./product-placeholder.svg",
                "description": "",
                "active": True,
            }
        )

    if not products:
        raise ValueError("A planilha não contém produtos para importar.")
    return products


def import_products(products, project_url, service_role_key):
    endpoint = f"{project_url.rstrip('/')}/rest/v1/products?on_conflict=source_row"
    for start in range(0, len(products), BATCH_SIZE):
        batch = products[start : start + BATCH_SIZE]
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f"Resposta inesperada do Supabase: HTTP {response.status}.")
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase recusou a importação (HTTP {error.code}): {details}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"Não foi possível conectar ao Supabase: {error.reason}") from error
        print(f"Importados/atualizados {min(start + len(batch), len(products))}/{len(products)} produtos.")


def main():
    workbook_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_WORKBOOK
    project_url = os.environ.get("SUPABASE_URL", "").strip()
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not project_url or not service_role_key:
        raise ValueError(
            "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. "
            "A chave de serviço não deve ser publicada nem enviada ao navegador."
        )
    if not workbook_path.is_file():
        raise FileNotFoundError(f"Planilha não encontrada: {workbook_path}")

    products = read_workbook(workbook_path)
    import_products(products, project_url, service_role_key)
    print(f"Importação concluída: {len(products)} produtos.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Erro: {error}", file=sys.stderr)
        raise SystemExit(1)
