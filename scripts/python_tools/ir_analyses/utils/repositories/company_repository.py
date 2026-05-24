"""
Companyモデルのためのリポジトリクラス。
汎用的なCRUD操作はBaseRepositoryから継承し、
Companyモデルに特化したデータアクセスロジックを提供します。
"""

from typing import List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select

from utils.db_models import Company
from utils.repositories.base_repository import BaseRepository


class CompanyRepository(BaseRepository[Company]):
    def __init__(self, session: Session):
        super().__init__(session, Company)

    def get_all_company_names_and_edinet_code(self) -> List[Tuple[str, str]]:
        """すべての企業名とそのEDINETコードを取得する"""
        result_rows = self.session.execute(
            select(Company.company_name, Company.edinet_code)
        ).all()

        return [tuple(row) for row in result_rows]

    def find_by_edinet_code(self, edinet_code: str) -> Company | None:
        statement = select(Company).where(Company.edinet_code == edinet_code)
        result = self.session.scalars(statement).first()
        return result

    def find_by_security_code(self, security_code: str) -> Company | None:
        """証券コード（例: 7203）から企業を検索する"""
        statement = select(Company).where(Company.security_code == security_code)
        result = self.session.scalars(statement).first()
        return result

    def find_by_company_name(self, company_name: str) -> Company | None:
        """企業名（完全一致・前方一致など）から企業を検索する"""
        statement = select(Company).where(Company.company_name.like(f"%{company_name}%"))
        result = self.session.scalars(statement).first()
        return result
