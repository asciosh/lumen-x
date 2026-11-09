# The build context is the backend/ folder.
# DOTNET_MAJOR must match PackagesMajor in Directory.Build.props
# (it is also forced in publish/restore here, so they cannot diverge inside the image).
ARG DOTNET_MAJOR=10

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_MAJOR}.0 AS build
ARG DOTNET_MAJOR
WORKDIR /src
COPY Directory.Build.props ./
COPY src/LumenX.Api/LumenX.Api.csproj src/LumenX.Api/
RUN dotnet restore src/LumenX.Api/LumenX.Api.csproj -p:PackagesMajor=${DOTNET_MAJOR}
COPY src/LumenX.Api/ src/LumenX.Api/
RUN dotnet publish src/LumenX.Api/LumenX.Api.csproj -c Release -o /app/publish --no-restore -p:PackagesMajor=${DOTNET_MAJOR}

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_MAJOR}.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "LumenX.Api.dll"]
