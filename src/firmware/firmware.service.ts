import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import { constants, createReadStream } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CheckFirmwareDto } from './dto/check-firmware.dto';
import { compareVersion } from './utils/compare-version.util';

export interface FirmwareVersion {
  version: string;
  file: string;
  notes?: string;
  date?: string;
  mandatory?: boolean;
  sha256?: string;
  size_bytes?: number;
}

export interface FirmwareManifest {
  latest: FirmwareVersion;
  versions?: FirmwareVersion[];
}

interface FirmwareCacheItem {
  size_bytes: number;
  sha256: string;
  mtimeMs: number;
}

@Injectable()
export class FirmwareService {
  private metadataCache = new Map<string, FirmwareCacheItem>();

  private getLatestJsonPath(): string {
    return path.join(process.cwd(), 'data', 'firmware', 'latest.json');
  }

  private async readLatestJson(): Promise<FirmwareManifest> {
    const filePath = this.getLatestJsonPath();
    
    try {
      await fs.access(filePath, constants.F_OK);
    } catch {
      throw new NotFoundException('El archivo de metadatos de firmware no existe.');
    }
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      if (!parsed || !parsed.latest || !parsed.latest.version || !parsed.latest.file) {
        throw new Error('El JSON de firmware no tiene el formato correcto (faltan latest.version o latest.file)');
      }
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new InternalServerErrorException('El archivo de firmware está mal formado.');
      }
      throw new InternalServerErrorException('Error leyendo los metadatos: ' + error.message);
    }
  }

  /**
   * Calcula el hash SHA256 usando streams para no cargar el archivo completo en memoria.
   */
  private calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('error', err => reject(err));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Helper privado para validar existencia física, obtener tamaño y calcular SHA256 automático.
   * Utiliza cache en memoria invalidadable por mtimeMs y devuelve un nuevo objeto (puramente inmutable).
   */
  private async enrichFirmwareMetadata(firmware: FirmwareVersion): Promise<FirmwareVersion> {
    if (!firmware || !firmware.file) return firmware;

    const filename = path.basename(firmware.file);
    const localPath = path.join(process.cwd(), 'public', 'firmware', filename);

    let stat;
    try {
      stat = await fs.stat(localPath);
    } catch (err) {
      // Limpieza proactiva de caché si el archivo ya no existe físicamente
      if (this.metadataCache.has(filename)) {
        this.metadataCache.delete(filename);
      }
      throw new NotFoundException(`Firmware binary not found for version ${firmware.version}`);
    }

    const { size, mtimeMs } = stat;
    const cacheKey = filename;
    const cachedItem = this.metadataCache.get(cacheKey);

    let finalSha256 = firmware.sha256;
    const isPlaceholder = !finalSha256 || finalSha256 === 'OPCIONAL_HASH' || finalSha256.trim() === '';

    // Si el archivo no ha sido modificado y existe en cache
    if (cachedItem && cachedItem.mtimeMs === mtimeMs) {
      return {
        ...firmware,
        size_bytes: cachedItem.size_bytes,
        sha256: isPlaceholder ? cachedItem.sha256 : finalSha256,
      };
    }

    // Cómputo de nuevo hash si es necesario (con stream async)
    let calculatedSha256 = '';
    if (isPlaceholder) {
      calculatedSha256 = await this.calculateSha256(localPath);
      finalSha256 = calculatedSha256;
    }

    // Evitar crecimiento infinito del Map (Ej: límite 50 entradas)
    if (this.metadataCache.size >= 50 && !this.metadataCache.has(cacheKey)) {
      const firstKey = this.metadataCache.keys().next().value;
      if (firstKey) this.metadataCache.delete(firstKey);
    }

    // Actualizar cache inteligente de forma centralizada
    this.metadataCache.set(cacheKey, {
      size_bytes: size,
      sha256: isPlaceholder ? calculatedSha256 : (finalSha256 || ''),
      mtimeMs,
    });

    return {
      ...firmware, // No muta, retorna un objeto puro nuevo
      size_bytes: size,
      sha256: finalSha256,
    };
  }

  async getLatestVersion(): Promise<FirmwareManifest> {
    const data = await this.readLatestJson();
    
    // Generar nuevos objetos inmutables
    const enrichedLatest = data.latest 
      ? await this.enrichFirmwareMetadata(data.latest)
      : data.latest;

    const enrichedVersions = Array.isArray(data.versions)
      ? await Promise.all(data.versions.map((ver) => this.enrichFirmwareMetadata(ver)))
      : data.versions;

    return {
      ...data,
      latest: enrichedLatest,
      versions: enrichedVersions
    };
  }

  async getVersions(): Promise<FirmwareVersion[]> {
    const data = await this.readLatestJson();
    if (!Array.isArray(data.versions)) return [];

    return Promise.all(
      data.versions.map((ver) => this.enrichFirmwareMetadata(ver))
    );
  }

  async checkUpdate(query: CheckFirmwareDto): Promise<any> {
    const data = await this.readLatestJson();
    const latest = data.latest;

    const cmp = compareVersion(latest.version, query.version);

    if (cmp > 0) {
      // Validar física y metadata si hay update ANTES de contestarle true al frontend
      const enrichedLatest = await this.enrichFirmwareMetadata(latest);
      
      return {
        update: true,
        current_version: query.version,
        latest_version: enrichedLatest.version,
        mandatory: enrichedLatest.mandatory || false,
        notes: enrichedLatest.notes || '',
        date: enrichedLatest.date || '',
        file: enrichedLatest.file,
        size_bytes: enrichedLatest.size_bytes, // <- Agregado automáticamente
        sha256: enrichedLatest.sha256 // <- Validado/Calculado automáticamente
      };
    } else {
      return {
        update: false,
        current_version: query.version,
        latest_version: latest.version,
        mandatory: latest.mandatory || false
      };
    }
  }
}
