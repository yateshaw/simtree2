#!/bin/bash

# Fecha y hora para el nombre del archivo
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="backup_$DATE.sql"

# Crear backup
pg_dump $DATABASE_URL > $FILENAME

# Eliminar backups de más de 7 días (opcional)
find . -name "backup_*.sql" -type f -mtime +7 -exec rm {} \;

echo "✅ Backup guardado como $FILENAME"
