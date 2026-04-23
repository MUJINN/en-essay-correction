#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库连接和初始化
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
from typing import Generator
import os
from pathlib import Path

# 数据库URL（SQLite用于开发，可升级到PostgreSQL）
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./essay_correction.db"  # SQLite文件数据库
    # "postgresql://user:password@localhost/essay_correction"  # PostgreSQL
)

# 创建引擎
engine = create_engine(
    DATABASE_URL,
    # SQLite配置
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
    # PostgreSQL配置
    # pool_pre_ping=True,
    # pool_recycle=300,
)

# 创建会话
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建表
def create_tables():
    """创建所有数据表"""
    from models import Base
    Base.metadata.create_all(bind=engine)

# 获取数据库会话
def get_db() -> Generator[Session, None, None]:
    """获取数据库会话依赖注入"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 数据库初始化
def init_database():
    """初始化数据库"""
    print("🔧 初始化数据库...")
    create_tables()
    print("✅ 数据库初始化完成")

# 数据库迁移（为将来准备）
def migrate_database():
    """数据库迁移"""
    # 这里可以集成Alembic进行数据库版本管理
    pass

if __name__ == "__main__":
    init_database()
