CREATE TABLE `fato_comercio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ano` int DEFAULT NULL,
  `mes` int DEFAULT NULL,
  `id_ncm` int DEFAULT NULL,
  `id_pais` int DEFAULT NULL,
  `id_via` int DEFAULT NULL,
  `kg_liquido` double DEFAULT NULL,
  `valor_fob` double DEFAULT NULL,
  `tipo_operacao` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `fato_dolar` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data_cotacao` date DEFAULT NULL,
  `cotacao_compra` double DEFAULT NULL,
  `cotacao_venda` double DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `fato_selic` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data` date DEFAULT NULL,
  `valor` double DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `fato_ipca` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ano` int DEFAULT NULL,
  `mes` int DEFAULT NULL,
  `valor` double DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
