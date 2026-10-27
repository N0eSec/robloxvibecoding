--!strict
--[[
	DashboardTelemetry — envía cada compra al dashboard local en tiempo real.

	INSTALACIÓN
	1. Pega este script en ServerScriptService (como Script, RunContext = Server).
	2. Game Settings → Security → activa "Allow HTTP Requests".
	3. Cambia DASHBOARD_URL y SECRET abajo. SECRET debe ser igual a INGEST_SECRET del .env.
	4. Para que tu PC reciba los datos desde los servidores de Roblox necesitas una URL
	   pública: abre un túnel con   ngrok http 8787   (o cloudflared) y pega esa URL.
	   Si solo pruebas en Studio con "Allow HTTP Requests", http://localhost:8787 funciona.

	IMPORTANTE
	Si tu juego ya tiene un ProcessReceipt, NO uses el de aquí: llama a
	DashboardTelemetry.Report(...) desde el tuyo (ver el ejemplo al final).
]]

local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local DASHBOARD_URL = "http://localhost:8787"
local SECRET = "cambia-esto-por-tu-INGEST_SECRET"

-- Si ya tienes un ProcessReceipt propio, deja esto en false y usa Report() desde el tuyo.
local INSTALL_PROCESS_RECEIPT = true

local QUEUE_FLUSH_SECONDS = 3
local MAX_BATCH = 25

local queue: { any } = {}
local productNameCache: { [number]: string } = {}

local function productName(productId: number): string
	local cached = productNameCache[productId]
	if cached then
		return cached
	end
	local okCall, info = pcall(function()
		return MarketplaceService:GetProductInfo(productId, Enum.InfoType.Product)
	end)
	local name = (okCall and info and info.Name) or ("Producto " .. productId)
	productNameCache[productId] = name
	return name
end

local function flush()
	if #queue == 0 then
		return
	end
	local batch = {}
	for _ = 1, math.min(MAX_BATCH, #queue) do
		table.insert(batch, table.remove(queue, 1))
	end

	local okCall, err = pcall(function()
		HttpService:RequestAsync({
			Url = DASHBOARD_URL .. "/api/ingest",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["x-ingest-secret"] = SECRET,
			},
			Body = HttpService:JSONEncode({ purchases = batch }),
		})
	end)

	if not okCall then
		warn("[DashboardTelemetry] no se pudo enviar:", err)
		-- Devolvemos el lote a la cola para reintentar en el siguiente ciclo.
		for i = #batch, 1, -1 do
			table.insert(queue, 1, batch[i])
		end
	end
end

--- Encola una compra. Llama a esto desde tu propio ProcessReceipt si ya tienes uno.
local function Report(player: Player?, productId: number, robux: number, kind: string?)
	table.insert(queue, {
		id = HttpService:GenerateGUID(false),
		ts = DateTime.now().UnixTimestampMillis,
		userId = player and tostring(player.UserId) or nil,
		username = player and player.Name or nil,
		productId = tostring(productId),
		productName = productName(productId),
		robux = robux,
		kind = kind or "DeveloperProduct",
		placeId = tostring(game.PlaceId),
	})
end

if INSTALL_PROCESS_RECEIPT then
	warn("[DashboardTelemetry] ProcessReceipt instalado por el dashboard. "
		.. "Si tu juego ya entrega productos en otro script, pon INSTALL_PROCESS_RECEIPT = false "
		.. "y llama a _G.DashboardReport(player, productId, robux) desde el tuyo.")
	MarketplaceService.ProcessReceipt = function(receipt: any)
		local player = Players:GetPlayerByUserId(receipt.PlayerId)
		Report(player, receipt.ProductId, receipt.CurrencySpent, "DeveloperProduct")
		-- OJO: aquí debes entregar el producto al jugador antes de devolver Granted.
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
end

-- Gamepasses (no pasan por ProcessReceipt).
MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, gamePassId, wasPurchased)
	if not wasPurchased then
		return
	end
	local okCall, info = pcall(function()
		return MarketplaceService:GetProductInfo(gamePassId, Enum.InfoType.GamePass)
	end)
	local price = (okCall and info and info.PriceInRobux) or 0
	table.insert(queue, {
		id = HttpService:GenerateGUID(false),
		ts = DateTime.now().UnixTimestampMillis,
		userId = tostring(player.UserId),
		username = player.Name,
		productId = tostring(gamePassId),
		productName = (okCall and info and info.Name) or ("Gamepass " .. gamePassId),
		robux = price,
		kind = "GamePass",
	})
end)

task.spawn(function()
	while true do
		task.wait(QUEUE_FLUSH_SECONDS)
		flush()
	end
end)

game:BindToClose(function()
	flush()
	if RunService:IsStudio() then
		task.wait(1)
	end
end)

--[[
	Ejemplo si YA tienes tu propio ProcessReceipt:

	MarketplaceService.ProcessReceipt = function(receipt)
		local player = Players:GetPlayerByUserId(receipt.PlayerId)
		entregarProducto(player, receipt.ProductId)       -- tu lógica
		_G.DashboardReport(player, receipt.ProductId, receipt.CurrencySpent)
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
]]
_G.DashboardReport = Report
